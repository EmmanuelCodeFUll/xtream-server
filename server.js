const http = require('http');
const https = require('https');
const url = require('url');

const M3U_URL = 'https://mi-lista-iptv.netlify.app/MiLista_Verificada.m3u';
const USERNAME = 'nemis';
const PASSWORD = 'blackedge2026';
const PORT = process.env.PORT || 3000;

function fetchM3U(callback) {
    https.get(M3U_URL, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => callback(null, data));
    }).on('error', err => callback(err));
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;
    const query = parsedUrl.query;
    const auth = query.username === USERNAME && query.password === PASSWORD;

    if (path === '/get.php') {
        if (!auth) { res.writeHead(401); return res.end('Unauthorized'); }
        fetchM3U((err, data) => {
            if (err) { res.writeHead(500); return res.end('Error'); }
            res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
            res.end(data);
        });
    }
    else if (path === '/player_api.php') {
        if (!auth) { res.writeHead(401); return res.end(JSON.stringify({ user_info: { auth: 0 } })); }
        
        if (query.action === 'get_live_categories') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify([
                { category_id: "1", category_name: "USA VIP", parent_id: 0 },
                { category_id: "2", category_name: "LAME", parent_id: 0 },
                { category_id: "3", category_name: "Deportes", parent_id: 0 },
                { category_id: "4", category_name: "Noticias", parent_id: 0 },
                { category_id: "5", category_name: "Entretenimiento", parent_id: 0 },
                { category_id: "6", category_name: "ES", parent_id: 0 },
                { category_id: "99", category_name: "General", parent_id: 0 }
            ]));
        }
        
        if (query.action === 'get_live_streams') {
            fetchM3U((err, data) => {
                if (err) { res.writeHead(500); return res.end('[]'); }
                const lines = data.split('\n');
                const streams = [];
                let id = 1;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('#EXTINF')) {
                        const nameMatch = lines[i].match(/,(.+)$/);
                        const groupMatch = lines[i].match(/group-title="([^"]*)"/);
                        const logoMatch = lines[i].match(/tvg-logo="([^"]*)"/);
                        const streamUrl = lines[i+1] ? lines[i+1].trim() : '';
                        if (streamUrl && nameMatch) {
                            streams.push({
                                num: id,
                                name: nameMatch[1].trim(),
                                stream_type: "live",
                                stream_id: id,
                                stream_icon: logoMatch ? logoMatch[1] : '',
                                epg_channel_id: '',
                                added: '1609459200',
                                category_id: '99',
                                custom_sid: '',
                                tv_archive: 0,
                                direct_source: streamUrl,
                                tv_archive_duration: 0
                            });
                            id++;
                        }
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(streams));
            });
            return;
        }

        const info = {
            user_info: {
                username: USERNAME, password: PASSWORD,
                message: "Mi Lista IPTV", auth: 1, status: "Active",
                exp_date: "2556143999", is_trial: "0", active_cons: "1",
                created_at: "1609459200", max_connections: "5",
                allowed_output_formats: ["m3u8", "ts", "rtmp"]
            },
            server_info: {
                url: "xtream-server.onrender.com", port: "80",
                https_port: "443", server_protocol: "http",
                rtmp_port: "25462", timezone: "America/New_York",
                timestamp_now: Math.floor(Date.now() / 1000),
                time_now: new Date().toISOString()
            }
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
    }
    else {
        res.writeHead(200);
        res.end('IPTV Server Running');
    }
});

server.listen(PORT, () => console.log('Server running on port ' + PORT));