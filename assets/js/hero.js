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
  var fan = [];     // beams rising from the beacon
  var nodes = [];   // junction dots
  var cx = 0, cy = 0;

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

  function drawLane(lane, time) {
    strokePoly(lane.pts, 1, lane.dim);

    // a packet of light travelling toward the beacon
    for (var p = 0; p < lane.pulses.length; p++) {
      var u = (lane.pulses[p] + time * 0.00004 * (1 + p * 0.4)) % 1;
      var d = lane.m.total * (1 - u);            // inward: total -> 0
      var pt = pointAt(lane.pts, lane.m, d);
      var fade = Math.sin(Math.PI * u);          // ease in and out at the ends
      ctx.globalAlpha = 0.25 + fade * 0.75;
      glow(pt.x, pt.y, 16, 0.30 * fade + 0.06);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(190, 255, 246,' + (0.5 * fade + 0.2) + ')';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.7, 0, 6.2832);
      ctx.fill();
    }
  }

  function drawFan(beam, time) {
    strokePoly(beam.pts, 1, beam.dim);

    // each beam carries a marker drifting outward
    var u = (beam.pulses[0] + time * beam.dot.speed) % 1;
    var pt = pointAt(beam.pts, beam.m, beam.m.total * u);
    var fade = Math.sin(Math.PI * u);
    glow(pt.x, pt.y, 14, 0.22 * fade + 0.04);
    ctx.fillStyle = 'rgba(190, 255, 246,' + (0.55 * fade + 0.25) + ')';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, beam.dot.r, 0, 6.2832);
    ctx.fill();

    // the fixed lamp at the tip of the beam
    var last = beam.pts[beam.pts.length - 1];
    var tip = { x: last[0], y: last[1] };
    var pulse = 0.55 + 0.45 * Math.sin(time * 0.0012 + beam.pulses[1] * 6.28);
    glow(tip.x, tip.y, 9, 0.20 * pulse);
    ctx.fillStyle = 'rgba(200, 255, 248,' + (0.35 + 0.35 * pulse) + ')';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, beam.dot.r, 0, 6.2832);
    ctx.fill();
  }

  function drawBeacon(time) {
    var breath = 0.75 + 0.25 * Math.sin(time * 0.0009);

    glow(cx, cy, Math.min(W, H) * 0.62, 0.16 * breath);
    glow(cx, cy, Math.min(W, H) * 0.26, 0.22 * breath);
    glow(cx, cy, 64, 0.42 * breath);

    // expanding rings
    for (var i = 0; i < 3; i++) {
      var u = ((time * 0.00016 + i / 3) % 1);
      var r = 20 + u * Math.min(W, H) * 0.42;
      ctx.strokeStyle = 'rgba(' + TEAL + ',' + (0.16 * (1 - u)).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 6.2832);
      ctx.stroke();
    }

    // filament core
    ctx.fillStyle = 'rgba(226, 255, 252,' + (0.75 + 0.25 * breath) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, 6.2832);
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
      glow(n.x, n.y, 13, 0.26 * pulse + 0.05);
      ctx.fillStyle = 'rgba(198, 255, 247,' + (0.4 + 0.5 * pulse) + ')';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, 6.2832);
      ctx.fill();
    }
  }

  function render(time) {
    ctx.clearRect(0, 0, W, H);

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
