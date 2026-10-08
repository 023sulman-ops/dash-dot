// Prepares the web files and patches the generated Android project. Run by the GitHub workflow.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const mode = process.argv[2];
const ADMOB_APP_ID = process.env.ADMOB_APP_ID || 'ca-app-pub-3940256099942544~3347511713'; // Google TEST app id
const BG = '#1d2b53';
const RES = 'android/app/src/main/res';

function web() {
  fs.mkdirSync('www', { recursive: true });
  let h = fs.readFileSync('dash-dot.html', 'utf8');
  const fd = 'node_modules/@fontsource/fredoka/files/';
  if (fs.existsSync(fd + 'fredoka-latin-500-normal.woff2') && fs.existsSync(fd + 'fredoka-latin-700-normal.woff2')) {
    fs.copyFileSync(fd + 'fredoka-latin-500-normal.woff2', 'www/fredoka-500.woff2');
    fs.copyFileSync(fd + 'fredoka-latin-700-normal.woff2', 'www/fredoka-700.woff2');
    const css = "<style>@font-face{font-family:'Fredoka';font-weight:500;font-display:swap;src:url(fredoka-500.woff2) format('woff2')}@font-face{font-family:'Fredoka';font-weight:700;font-display:swap;src:url(fredoka-700.woff2) format('woff2')}</style>";
    const n = h.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, css);
    if (n !== h) { h = n; console.log('Fredoka font bundled for offline use'); }
  } else console.log('Fredoka package not found - the game will use the online font');
  fs.writeFileSync('www/index.html', h);
  console.log('www/index.html ready');
}

function im(args) {
  for (const bin of ['magick', 'convert']) {
    try { execFileSync(bin, args, { stdio: 'pipe' }); return true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw new Error('ImageMagick not found');
}
function walk(dir, name, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out); else if (e.name === name) out.push(p);
  }
  return out;
}

function android() {
  // 1) manifest: AdMob app id + portrait only
  const mf = 'android/app/src/main/AndroidManifest.xml';
  let m = fs.readFileSync(mf, 'utf8');
  if (!m.includes('com.google.android.gms.ads.APPLICATION_ID'))
    m = m.replace(/(<application[^>]*>)/, '$1\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="@string/admob_app_id"/>');
  if (!m.includes('android:screenOrientation'))
    m = m.replace(/<activity(\s)/, '<activity android:screenOrientation="portrait"$1');
  fs.writeFileSync(mf, m);
  if (!m.includes('APPLICATION_ID') || !m.includes('screenOrientation')) throw new Error('Manifest patch failed');

  // 2) AdMob app id string
  const sf = RES + '/values/strings.xml';
  let s = fs.readFileSync(sf, 'utf8');
  if (!s.includes('admob_app_id')) s = s.replace('</resources>', '    <string name="admob_app_id">' + ADMOB_APP_ID + '</string>\n</resources>');
  fs.writeFileSync(sf, s);

  // 3) launcher icon from icon.png
  if (fs.existsSync('icon.png')) {
    const sizes = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
    for (const [d, [l, f]] of Object.entries(sizes)) {
      const dir = RES + '/mipmap-' + d;
      fs.mkdirSync(dir, { recursive: true });
      const c = l / 2;
      im(['icon.png', '-resize', l + 'x' + l, dir + '/ic_launcher.png']);
      im(['icon.png', '-resize', l + 'x' + l, '-alpha', 'set', '(', '+clone', '-channel', 'A', '-evaluate', 'set', '0', '+channel', '-fill', 'white', '-draw', 'circle ' + c + ',' + c + ' ' + c + ',0', ')', '-compose', 'DstIn', '-composite', dir + '/ic_launcher_round.png']);
      im(['icon.png', '-resize', f + 'x' + f, dir + '/ic_launcher_foreground.png']);
    }
    const ad = RES + '/mipmap-anydpi-v26';
    fs.mkdirSync(ad, { recursive: true });
    const xml = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
    fs.writeFileSync(ad + '/ic_launcher.xml', xml);
    fs.writeFileSync(ad + '/ic_launcher_round.xml', xml);
    fs.writeFileSync(RES + '/values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">' + BG + '</color>\n</resources>\n');
    console.log('icons written');
  }

  // 4) plain colour splash instead of the Capacitor logo
  for (const p of walk(RES, 'splash.png')) {
    try {
      const size = execFileSync('identify', ['-format', '%wx%h', p]).toString().trim();
      im(['-size', size, 'xc:' + BG, p]);
    } catch (e) { console.log('splash skipped for ' + p); }
  }
  console.log('android project patched');
}

if (mode === 'web') web(); else if (mode === 'android') android(); else { console.error('use: node setup.js web|android'); process.exit(1); }
