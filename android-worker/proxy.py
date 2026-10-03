from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request, ssl, os

TARGET = 'kisskh.co'
# IMPORTANT: this relay must NOT share the API port. node server.js listens on
# PORT (default 8080) and ngrok tunnels that. Run the relay on a SEPARATE port.
PORT = int(os.environ.get('PROXY_PORT', '9090'))
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

class H(BaseHTTPRequestHandler):
    def do_GET(self): self.proxy()
    def proxy(self):
        url = f'https://{TARGET}{self.path}'
        req = urllib.request.Request(url, headers={
            'Host': TARGET,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
        })
        try:
            r = urllib.request.urlopen(req, context=ctx)
            self.send_response(r.status)
            for k, v in r.getheaders():
                if k.lower() not in ('transfer-encoding', 'connection'):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(r.read())
        except Exception as e:
            self.send_response(502); self.end_headers()
            self.wfile.write(str(e).encode())
    def log_message(self, *a): pass

print(f'[proxy.py] KissKH relay listening on 0.0.0.0:{PORT} -> https://{TARGET}')
HTTPServer(('0.0.0.0', PORT), H).serve_forever()
