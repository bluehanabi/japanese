class KanjiCanvas {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    
    // 기본 그리기 설정
    this.isDrawing = false;
    this.brushColor = options.brushColor || '#8B5CF6'; // Vibrant violet theme
    this.lineWidth = options.lineWidth || 10;
    this.guideKanji = '';
    this.showGuide = true;
    this.showGrid = true;
    
    // 기기 픽셀 매칭 (고해상도 캔버스 설정)
    this.resizeCanvas();
    
    // 이벤트 리스너 바인딩
    this.initEvents();
    
    // 초기 렌더링
    this.redraw();
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = rect.width || 350;
    const height = rect.height || 350;
    
    // 고선명 모바일 디바이스 지원
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    this.ctx.scale(dpr, dpr);
    this.width = width;
    this.height = height;
  }

  initEvents() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const pos = getPos(e);
      this.ctx.beginPath();
      // 테두리가 부드러운 브러시 스타일 설정
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeStyle = this.brushColor;
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    };

    const stopDraw = () => {
      this.isDrawing = false;
      this.ctx.closePath();
    };

    // 마우스 이벤트
    this.canvas.addEventListener('mousedown', startDraw);
    this.canvas.addEventListener('mousemove', draw);
    this.canvas.addEventListener('mouseup', stopDraw);
    this.canvas.addEventListener('mouseleave', stopDraw);

    // 모바일 터치 이벤트
    this.canvas.addEventListener('touchstart', startDraw, { passive: false });
    this.canvas.addEventListener('touchmove', draw, { passive: false });
    this.canvas.addEventListener('touchend', stopDraw);
  }

  setGuideKanji(kanjiChar) {
    this.guideKanji = kanjiChar;
    this.clearUserStroke();
  }

  toggleGuide(visible) {
    this.showGuide = visible;
    this.redraw();
  }

  toggleGrid(visible) {
    this.showGrid = visible;
    this.redraw();
  }

  clearUserStroke() {
    this.redraw();
  }

  redraw() {
    // 캔버스 완전 리셋
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // 1. 배경 그리드 그리기 (점선 십자 십자)
    if (this.showGrid) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([5, 5]);
      
      // 가로 세로 중심선
      this.ctx.beginPath();
      this.ctx.moveTo(this.width / 2, 0);
      this.ctx.lineTo(this.width / 2, this.height);
      this.ctx.moveTo(0, this.height / 2);
      this.ctx.lineTo(this.width, this.height / 2);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 2. 가이드 한자 그리기 (매우 옅은 회색 배경)
    if (this.showGuide && this.guideKanji) {
      this.ctx.save();
      this.ctx.font = `220px 'Noto Sans JP', 'Outfit', sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; // 은은한 비주얼 힌트
      this.ctx.fillText(this.guideKanji, this.width / 2, this.height / 2 + 10);
      this.ctx.restore();
    }
  }
}
