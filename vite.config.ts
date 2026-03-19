import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { spawn } from 'child_process';

const LAB_DIR = path.resolve(__dirname, 'lab');

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

                        const cwd = launchDir === '.' ? LAB_DIR : path.join(LAB_DIR, launchDir);
                        const args = url === '/launch' ? ['up'] : ['destroy', '-f'];

                        res.writeHead(200, {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-cache',
                            'Transfer-Encoding': 'chunked',
                            'X-Content-Type-Options': 'nosniff',
                        });

                        const proc = spawn('vagrant', args, { cwd, shell: true });
                        proc.stdout.on('data', (d: any) => res.write(d.toString()));
                        proc.stderr.on('data', (d: any) => res.write(d.toString()));
                        proc.on('close', (code: any) => {
                            res.write(`\n[Exit code: ${code ?? -1}]\n`);
                            res.end();
                        });
                        proc.on('error', (err: any) => {
                            res.write(`\n[Error] ${err.message}\n`);
                            res.end();
                        });
                    });
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
    },
});
