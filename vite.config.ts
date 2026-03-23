/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawn } from 'child_process';

const LAB_DIR = path.resolve(__dirname, 'lab');

// ── Per-job log buffer so clients can reconnect after a page refresh ──────────
interface JobState {
    buf:    string[];
    done:   boolean;
    code:   number | null;
    action: string;
    dir:    string;
    subscribers: Set<any>;
}
const jobs = new Map<string, JobState>();  // key = launchDir

function jobKey(dir: string) { return dir; }

function labApiPlugin() {
    return {
        name: 'lab-api',
        configureServer(server: any) {
            server.middlewares.use('/api/lab', (req: any, res: any, next: () => void) => {
                const url: string = req.url ?? '';

                if (req.method === 'OPTIONS') {
                    res.writeHead(204);
                    res.end();
                    return;
                }

                // POST /api/lab/launch  or  /api/lab/destroy — streaming output
                if (req.method === 'POST' && (url === '/launch' || url === '/destroy')) {
                    let body = '';
                    req.on('data', (chunk: any) => { body += chunk.toString(); });
                    req.on('end', () => {
                        let launchDir: string;
                        try {
                            ({ launchDir } = JSON.parse(body));
                        } catch {
                            res.writeHead(400);
                            res.end('Invalid JSON');
                            return;
                        }

                        const key = jobKey(launchDir);
                        const cwd = launchDir === '.' ? LAB_DIR : path.join(LAB_DIR, launchDir);
                        const args = url === '/launch' ? ['up'] : ['destroy', '-f'];

                        // Create/replace job state
                        const job: JobState = { buf: [], done: false, code: null, action: url.slice(1), dir: launchDir, subscribers: new Set() };
                        jobs.set(key, job);

                        res.writeHead(200, {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-cache',
                            'Transfer-Encoding': 'chunked',
                            'X-Content-Type-Options': 'nosniff',
                        });

                        const broadcast = (text: string) => {
                            job.buf.push(text);
                            job.subscribers.forEach((s: any) => { try { s.write(text); } catch {} });
                        };

                        const proc = spawn('vagrant', args, { cwd, shell: true });
                        proc.stdout.on('data', (d: any) => broadcast(d.toString()));
                        proc.stderr.on('data', (d: any) => broadcast(d.toString()));
                        proc.on('close', (code: any) => {
                            const msg = `\n[Exit code: ${code ?? -1}]\n`;
                            broadcast(msg);
                            job.done = true;
                            job.code = code ?? -1;
                            job.subscribers.forEach((s: any) => { try { s.end(); } catch {} });
                            job.subscribers.clear();
                            res.end();
                        });
                        proc.on('error', (err: any) => {
                            const msg = `\n[Error] ${err.message}\n`;
                            broadcast(msg);
                            job.done = true;
                            job.subscribers.forEach((s: any) => { try { s.end(); } catch {} });
                            job.subscribers.clear();
                            res.end();
                        });
                    });
                    return;
                }

                // GET /api/lab/logs?dir=... — replay buffered logs + stream remainder
                if (req.method === 'GET' && url.startsWith('/logs')) {
                    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
                    const dir = params.get('dir') ?? '.';
                    const job = jobs.get(jobKey(dir));
                    if (!job) {
                        res.writeHead(404);
                        res.end('No active job for this dir');
                        return;
                    }
                    res.writeHead(200, {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Cache-Control': 'no-cache',
                        'Transfer-Encoding': 'chunked',
                    });
                    // Replay buffered output
                    job.buf.forEach((chunk: string) => res.write(chunk));
                    if (job.done) {
                        res.end();
                        return;
                    }
                    // Subscribe for future chunks
                    job.subscribers.add(res);
                    req.on('close', () => job.subscribers.delete(res));
                    return;
                }

                // GET /api/lab/active — list running jobs
                if (req.method === 'GET' && url === '/active') {
                    const active = [...jobs.entries()]
                        .filter(([, j]) => !j.done)
                        .map(([dir, j]) => ({ dir, action: j.action }));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(active));
                    return;
                }

                // GET /api/lab/status?dir=scenarios/kerberos-basics
                if (req.method === 'GET' && url.startsWith('/status')) {
                    const qStr = url.includes('?') ? url.split('?')[1] : '';
                    const params = new URLSearchParams(qStr);
                    const launchDir = params.get('dir') ?? '.';
                    const cwd = launchDir === '.' ? LAB_DIR : path.join(LAB_DIR, launchDir);

                    let out = '';
                    const proc = spawn('vagrant', ['status', '--machine-readable'], { cwd, shell: true });
                    proc.stdout.on('data', (d: any) => { out += d.toString(); });
                    proc.on('close', () => {
                        const states: Record<string, string> = {};
                        for (const line of out.split('\n')) {
                            const parts = line.split(',');
                            if (parts.length >= 4 && parts[2] === 'state-human-short') {
                                states[parts[1]] = parts[3].trim();
                            }
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(states));
                    });
                    proc.on('error', () => {
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: 'vagrant not found' }));
                    });
                    return;
                }

                next();
            });
        },
    };
}

export default defineConfig({
    plugins: [react(), labApiPlugin()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        host: true,
    },
});
