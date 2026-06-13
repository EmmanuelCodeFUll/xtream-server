const http = require('http');
const https = require('https');
const url = require('url');

const M3U_URL = 'https://mi-lista-iptv.netlify.app/MiLista_Verificada.m3u';
const USERNAME = 'nemis';
const PASSWORD = 'blackedge2026';
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;

    if (path === '/get.php') {
        if (query.username === USERNAME && query.password === PASSWORD) {
            https.get(M3U_URL, (m3uRes) => {
                res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
                m3uRes.pipe(res);
            }).on('error', (e) => {
                res.writeHead(500);
                res.end('Error: ' + e.message);
            });
        } else {
            res.writeHead(401);
            res.end('Unauthorized');
        }
    }
    else if (path === '/player_api.php') {
        if (query.username === USERNAME && query.password === PASSWORD) {
            const info = {
                user_info: {
                    username: USERNAME,
                    password: PASSWORD,
                    message: "Mi Lista IPTV",
                    auth: 1,
                    status: "Active",
                    exp_date: "2556143999",
                    is_trial: "0",
                    active_cons: "1",
                    created_at: "1609459200",
                    max_connections: "5",
                    allowed_output_formats: ["m3u8", "ts", "rtmp"]
                },
                server_info: {
                    url: "xtream-server.onrender.com",
                    port: "80",
                    https_port: "443",
                    server_protocol: "http",
                    rtmp_port: "25462",
                    timezone: "America/New_York",
                    timestamp_now: Math.floor(Date.now() / 1000),
                    time_now: new Date().toISOString()
                }
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(info));
        } else {
            res.writeHead(401);
            res.end(JSON.stringify({ user_info: { auth: 0 } }));
        }
    }
    else {
        res.writeHead(200);
        res.end('IPTV Server Running');
    }
});

server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});