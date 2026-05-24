/**
 * KanjiCanvas — 한자 쓰기 연습 캔버스 (2-레이어)
 *  - bg 레이어: 그리드 + 가이드 한자 (토글해도 사용자 획은 보존)
 *  - draw 레이어: 사용자가 그린 획
 * 컨테이너 안에 두 개의 캔버스를 겹쳐서 사용한다.
 */
class KanjiCanvas {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.brushColor = options.brushColor || "#a78bfa";
    this.lineWidth = options.lineWidth || 12;
    this.guideKanji = "";
    this.showGuide = true;
    this.showGrid = true;
    this.isDrawing = false;

    // 컨테이너 비우고 두 레이어 생성
    this.container.innerHTML = "";
    this.bg = document.createElement("canvas");
    this.draw = document.createElement("canvas");
    for (const c of [this.bg, this.draw]) {
      c.style.position = "absolute";
      c.style.inset = "0";
      c.style.width = "100%";
      c.style.height = "100%";
      this.container.appendChild(c);
    }
    this.bgCtx = this.bg.getContext("2d");
    this.drawCtx = this.draw.getContext("2d");

    this.resize();
    this.initEvents();
    this.renderBg();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 320;
    const dpr = window.devicePixelRatio || 1;
    for (const { c, ctx } of [
      { c: this.bg, ctx: this.bgCtx },
      { c: this.draw, ctx: this.drawCtx },
    ]) {
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    this.w = w;
    this.h = h;
  }

  initEvents() {
    const getPos = (e) => {
      const rect = this.draw.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: cx - rect.left, y: cy - rect.top };
    };

    const start = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      const p = getPos(e);
      const ctx = this.drawCtx;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = this.brushColor;
      ctx.lineWidth = this.lineWidth;
      ctx.moveTo(p.x, p.y);
      // 점 한 번 찍기 (탭만 해도 표시)
      ctx.lineTo(p.x + 0.1, p.y + 0.1);
      ctx.stroke();
    };
    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const p = getPos(e);
      this.drawCtx.lineTo(p.x, p.y);
      this.drawCtx.stroke();
    };
    const end = () => {
      this.isDrawing = false;
      this.drawCtx.closePath();
    };

    this.draw.addEventListener("mousedown", start);
    this.draw.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    this.draw.addEventListener("touchstart", start, { passive: false });
    this.draw.addEventListener("touchmove", move, { passive: false });
    this.draw.addEventListener("touchend", end);
  }

  setGuideKanji(ch) {
    this.guideKanji = ch || "";
    this.clear();
    this.renderBg();
  }

  toggleGuide(v) {
    this.showGuide = v;
    this.renderBg();
  }

  toggleGrid(v) {
    this.showGrid = v;
    this.renderBg();
  }

  clear() {
    this.drawCtx.clearRect(0, 0, this.w, this.h);
  }

  renderBg() {
    const ctx = this.bgCtx;
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.showGrid) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(this.w / 2, 0);
      ctx.lineTo(this.w / 2, this.h);
      ctx.moveTo(0, this.h / 2);
      ctx.lineTo(this.w, this.h / 2);
      ctx.stroke();
      // 테두리
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.strokeRect(0.5, 0.5, this.w - 1, this.h - 1);
      ctx.restore();
    }

    if (this.showGuide && this.guideKanji) {
      ctx.save();
      let size = Math.floor(Math.min(this.w, this.h) * 0.72);
      const fam = `'Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // 여러 글자(단어)면 가로폭에 맞게 축소
      ctx.font = `${size}px ${fam}`;
      const maxW = this.w * 0.88;
      const measured = ctx.measureText(this.guideKanji).width;
      if (measured > maxW) {
        size = Math.floor(size * (maxW / measured));
        ctx.font = `${size}px ${fam}`;
      }
      ctx.fillStyle = "rgba(167,139,250,0.16)";
      ctx.fillText(this.guideKanji, this.w / 2, this.h / 2 + size * 0.04);
      ctx.restore();
    }
  }
}
