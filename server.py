#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Kanji Flow - 로컬 웹 서버 커넥터
PC와 스마트폰을 같은 와이파이(Wi-Fi)에 연결하고, 아래 출력되는 IP 주소를 
모바일 브라우저에 입력하면 실제 안드로이드 앱처럼 공부하실 수 있습니다.
"""

import http.server
import socketserver
import socket
import sys

PORT = 8005

def get_local_ip():
    """현재 PC의 로컬 네트워크 IP 주소를 가져옵니다."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "192.168.10.35"

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    """헤더 캐시 방지 및 기본 로깅 오버라이드"""
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def run_server():
    local_ip = "192.168.10.35"
    public_ip = "211.109.91.64"
    
    print("=" * 60)
    print("        [ Kanji Flow - Japanese Kanji Learning Server ]")
    print("=" * 60)
    print("  [접속 단축 URL]")
    print(f"  * PC 로컬 접속  :  http://localhost:{PORT}")
    print(f"  * 와이파이 접속 :  http://{local_ip}:{PORT}")
    print(f"  * 외부 외부망 접속 :  http://{public_ip}:{PORT}")
    print("-" * 60)
    print("  [공지사항]")
    print("  스마트폰 브라우저에 위의 주소 중 하나를 입력해 바로 공부를 시작하세요!")
    print("  종료하려면 터미널에서 [ Ctrl + C ] 또는 태스크 정지를 수행하세요.")
    print("=" * 60)

    # 포트 재사용 허용 설정
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHTTPHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[알림] 서버가 안전하게 종료되었습니다. 공부하느라 수고하셨습니다!")
        sys.exit(0)
    except Exception as e:
        print(f"\n[오류] 서버 실행 중 오류가 발생했습니다: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_server()
