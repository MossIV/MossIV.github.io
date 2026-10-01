/* ============================================================
   Hero visual — native rebuild of the "Monolyth" scene.

   Same motif as the Unicorn Studio project it replaces (perspective
   circuit traces converging on a teal beacon) but drawn with the
   2D canvas API: no WebGL requirement, no third-party script, and
   no free-plan watermark. Runs on every screen size.
   ============================================================ */

(function () {
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TEAL = '79, 227, 207';
  var W = 0, H = 0, dpr = 1;
  var lanes = [];   // circuit traces
  var fan = [];     // beams converging on the beacon
  var nodes = [];   // junction dots
  var cx = 0, cy = 0;
  var charge = 0;   // 0..1 — how close an arriving packet is to the core

  var TARGET_FPS = 32;
  var frameGap = 1000 / TARGET_FPS;

  /* ── Geometry ───────────────────────────────────────────── */

  // A trace enters from an edge, runs parallel to the horizon, then takes a
  // 45-degree jog into the beacon — the same rule as the original scene.
  function tracePoints(dy, side, gap, offset) {
    var y0 = cy + dy + offset;
    var jog = Math.abs(dy);
    var p1x = cx - gap - jog;
    if (p1x < 0) p1x = 0;
    var pts = side < 0
      ? [[0, y0], [p1x, y0], [cx - gap, cy + offset], [cx, cy + offset]]
      : [[W, y0], [W - p1x, y0], [cx + gap, cy + offset], [cx, cy + offset]];
    return pts;
  }

  function measure(pts) {
    var total = 0, acc = [0];
    for (var i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      acc.push(total);
    }
    return { total: total, acc: acc };
  }

  function pointAt(pts, m, d) {
    if (m.total === 0) return { x: pts[0][0], y: pts[0][1] };
    d = ((d % m.total) + m.total) % m.total;
    for (var i = 1; i < pts.length; i++) {
      if (d <= m.acc[i]) {
        var seg = m.acc[i] - m.acc[i - 1];
        var t = seg === 0 ? 0 : (d - m.acc[i - 1]) / seg;
        return {
          x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t
        };
      }
    }
    return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
  }

  function build() {
    lanes = [];
    fan = [];
    nodes = [];

    cx = W * 0.5;
    cy = H * 0.62;

    var gap = Math.max(18, W * 0.02);
    var depth = [0.045, 0.10, 0.165, 0.245, 0.34, 0.45];

    for (var i = 0; i < depth.length; i++) {
      var dy = depth[i] * H;
      var lanesHere = i < 2 ? 3 : 2;   // denser traces near the beacon
      for (var k = 0; k < lanesHere; k++) {
        var offset = (k - (lanesHere - 1) / 2) * 9;
        [-1, 1].forEach(function (side) {
          var pts = tracePoints(dy, side, gap, offset);
          lanes.push({
            pts: pts,
            m: measure(pts),
            dim: 0.06 + 0.30 * (1 - i / depth.length),
            pulses: [Math.random(), Math.random() * 0.6 + 0.2]
          });
        });
      }
      // junction dots sit on the horizontal run, never dead centre
      [-1, 1].forEach(function (side) {
        var x = side < 0 ? W * (0.06 + 0.09 * i) : W * (0.94 - 0.09 * i);
        nodes.push({ x: x, y: cy + dy, r: i < 2 ? 2.1 : 1.5, phase: Math.random() * 6.28 });
      });
    }

    // Beams rising off the beacon, splayed like a fan.
    var beams = 13;
    for (var b = 0; b < beams; b++) {
      var t = b / (beams - 1) - 0.5;          // -0.5 .. 0.5
      var len = H * (0.34 + 0.16 * (1 - Math.abs(t) * 1.4));
      var spread = t * W * 0.34;
      var pts = [
        [cx, cy],
        [cx + spread * 0.42, cy - len * 0.55],
        [cx + spread, cy - len]
      ];
      fan.push({
        pts: pts,
        m: measure(pts),
        dim: 0.16 * (1 - Math.abs(t) * 1.3) + 0.05,
        pulses: [Math.random(), Math.random()],
        dot: { r: 1.4 + Math.random() * 0.9, speed: 0.00006 + Math.random() * 0.00006 }
      });
    }
  }

  /* ── Drawing ────────────────────────────────────────────── */

  function glow(x, y, r, alpha) {
    // A single non-finite value would throw and take the whole frame down,
    // so bail out instead of painting a broken hero.
    if (!isFinite(x) || !isFinite(y) || !isFinite(r) || r <= 0) return;
    if (!isFinite(alpha) || alpha <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + TEAL + ',' + alpha + ')');
    g.addColorStop(0.45, 'rgba(' + TEAL + ',' + alpha * 0.35 + ')');
    g.addColorStop(1, 'rgba(' + TEAL + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }

  function strokePoly(pts, width, alpha) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = width;
    ctx.strokeStyle = 'rgba(' + TEAL + ',' + alpha + ')';
    ctx.stroke();
  }

  // Strokes the stretch of a polyline between two distances, fading from one
  // alpha to another. Used to make traces brighten as they near the beacon.
  function strokeRamp(pts, m, d0, d1, width, a0, a1) {
    if (!isFinite(d0) || !isFinite(d1) || d1 <= d0) return;
    var head = pointAt(pts, m, d0);
    var tail = pointAt(pts, m, d1);
    var g = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    g.addColorStop(0, 'rgba(' + TEAL + ',' + a0 + ')');
    g.addColorStop(1, 'rgba(' + TEAL + ',' + a1 + ')');
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    var steps = 18;
    for (var i = 1; i <= steps; i++) {
      var p = pointAt(pts, m, d0 + (d1 - d0) * (i / steps));
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = g;
    ctx.stroke();
  }

  function drawLane(lane, time) {
    strokePoly(lane.pts, 1, lane.dim);

    // traces pick up light on the run into the beacon
    var len = lane.m.total;
    strokeRamp(lane.pts, lane.m, len * 0.7, len, 1.2, 0, lane.dim * 3.4);

    // packets of light pulled inward: they accelerate and brighten as they
    // close on the core, then re-enter at the rim dim
    for (var p = 0; p < lane.pulses.length; p++) {
      var u = (lane.pulses[p] + time * 0.00013 * (1 + p * 0.55)) % 1;
      var travel = Math.pow(u, 1.35);                     // most of the run happens late
      // d grows from 0 at the rim to len at the core: the packet converges
      var pt = pointAt(lane.pts, lane.m, len * travel);
      var lum = Math.pow(u, 1.7) * Math.min(1, u / 0.08); // no pop at the rim
      charge = Math.max(charge, Math.pow(u, 5));
      ctx.globalAlpha = 0.18 + lum * 0.82;
      glow(pt.x, pt.y, 9 + 16 * lum, 0.08 + 0.55 * lum);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(190, 255, 246,' + (0.12 + 0.78 * lum).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.1 + 1.4 * lum, 0, 6.2832);
      ctx.fill();
    }
  }

  function drawFan(beam, time) {
    strokePoly(beam.pts, 1, beam.dim * 0.8);
    strokeRamp(beam.pts, beam.m, beam.m.total * 0.45, beam.m.total, 1, beam.dim * 2.6, 0);

    // markers fall from the rim down onto the beacon
    var u = (beam.pulses[0] + time * beam.dot.speed * 5) % 1;
    var travel = Math.pow(u, 1.4);
    var pt = pointAt(beam.pts, beam.m, beam.m.total * (1 - travel));
    var lum = Math.pow(u, 1.6) * Math.min(1, u / 0.1);
    glow(pt.x, pt.y, 8 + 12 * lum, 0.06 + 0.5 * lum);
    ctx.fillStyle = 'rgba(190, 255, 246,' + (0.10 + 0.8 * lum).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, (0.9 + 1.2 * lum) * beam.dot.r, 0, 6.2832);
    ctx.fill();

    // faint station lamp at the rim — the outside is the dim end
    var last = beam.pts[beam.pts.length - 1];
    ctx.fillStyle = 'rgba(150, 235, 225, 0.28)';
    ctx.beginPath();
    ctx.arc(last[0], last[1], beam.dot.r * 0.75, 0, 6.2832);
    ctx.fill();
  }

  function drawBeacon(time) {
    var breath = 0.75 + 0.25 * Math.sin(time * 0.0009);
    // arriving packets charge the core, so the peak comes from the flow
    var surge = 0.85 + 0.6 * charge;

    glow(cx, cy, Math.min(W, H) * 0.55, 0.13 * breath * surge);
    glow(cx, cy, Math.min(W, H) * 0.24, 0.20 * breath * surge);
    glow(cx, cy, 70, 0.36 * breath * surge);
    glow(cx, cy, 24 + 18 * charge, 0.30 * surge);

    // rings fall inward and brighten as they close on the core
    for (var i = 0; i < 3; i++) {
      var u = ((time * 0.00022 + i / 3) % 1);
      var r = 22 + (1 - u) * Math.min(W, H) * 0.40;
      var a = 0.04 + 0.26 * Math.pow(u, 1.6);
      ctx.strokeStyle = 'rgba(' + TEAL + ',' + a.toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.stroke();
    }

    // filament core
    var core = Math.min(1, (0.7 + 0.3 * breath) * (0.8 + 0.4 * charge));
    ctx.fillStyle = 'rgba(226, 255, 252,' + core.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4 + 1.8 * charge, 0, 6.2832);
    ctx.fill();

    // the horizon the traces run along
    var hg = ctx.createLinearGradient(0, 0, W, 0);
    hg.addColorStop(0, 'rgba(' + TEAL + ',0)');
    hg.addColorStop(0.5, 'rgba(' + TEAL + ',0.20)');
    hg.addColorStop(1, 'rgba(' + TEAL + ',0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, cy - 0.5, W, 1);
  }

  function drawNodes(time) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var pulse = 0.5 + 0.5 * Math.sin(time * 0.0016 + n.phase);
      // kept deliberately dim: the core is the bright end of the flow
      glow(n.x, n.y, 11, 0.16 * pulse + 0.03);
      ctx.fillStyle = 'rgba(198, 255, 247,' + (0.26 + 0.34 * pulse).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, 6.2832);
      ctx.fill();
    }
  }

  function render(time) {
    ctx.clearRect(0, 0, W, H);

    charge = 0;   // rebuilt each frame from how close packets are to the core
    for (var i = 0; i < lanes.length; i++) drawLane(lanes[i], time);
    for (var j = 0; j < fan.length; j++) drawFan(fan[j], time);
    drawBeacon(time);
    drawNodes(time);
  }

  /* ── Sizing and the animation loop ──────────────────────── */

  function resize() {
    var rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);   // cap the fill cost
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduce) render(0);
  }

  var rafId = null;
  var last = 0;
  var visible = true;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (now - last < frameGap) return;
    last = now;
    render(now);
  }

  function start() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  resize();

  if (reduce) {
    render(0);                                   // one still frame, no motion
  } else {
    start();
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 150);
  });

  // Stop painting when the hero scrolls away or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !reduce) start(); else if (!visible) stop();
    }, { threshold: 0 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (!reduce && visible) start();
  });
})();
