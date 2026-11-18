import { geoPath, geoMercator, geoProjection, geoRotation, geoGraticule10, geoContains } from 'https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm';
import { geoRobinson, geoCylindricalEqualArea } from 'https://cdn.jsdelivr.net/npm/d3-geo-projection@4.0.0/+esm';
import { feature, mesh, neighbors } from 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
import versor from 'https://cdn.jsdelivr.net/npm/versor@0.2.0/+esm';

const polar = (l, p) => [(Math.PI / 2 - p) * Math.sin(l), -(Math.PI / 2 - p) * Math.cos(l)];
polar.invert = (x, y) => [Math.atan2(x, -y), Math.PI / 2 - Math.hypot(x, y)];

const projections = [geoMercator(), geoRobinson(), geoCylindricalEqualArea().parallel(45), geoProjection(polar).center([0, 90])];
const sphere = { type: 'Sphere' }, graticule = geoGraticule10();
const palette = ['#ead2a4', '#c3d3a2', '#e6b199', '#d3bcd4', '#a8ccb6', '#f1e4b3'];

const wrap = document.querySelector('.map'), glCanvas = wrap.querySelector('.relief'), canvas = wrap.querySelector('.vector');
const ctx = canvas.getContext('2d'), gl = glCanvas.getContext('webgl2');
const readout = document.querySelector('.readout');

let rotate = location.hash.slice(1).split(',').map(Number);
if (rotate.length != 3 || rotate.some(isNaN)) rotate = [0, 0, 0];
let proj = 0, style = 'physical', projection = projections[0], groups = [], borders, countries = [];

const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
const program = gl.createProgram();
gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1., 0., 1.); }`));
gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform samplerCube tex;
uniform mat3 rot;
uniform vec3 view;
uniform int proj;
out vec4 color;
const float PI = 3.141592653589793;
const vec2 K[20] = vec2[](vec2(.9986, -.062), vec2(1., 0.), vec2(.9986, .062), vec2(.9954, .124), vec2(.99, .186), vec2(.9822, .248), vec2(.973, .31), vec2(.96, .372), vec2(.9427, .434), vec2(.9216, .4958), vec2(.8962, .5571), vec2(.8679, .6176), vec2(.835, .6769), vec2(.7986, .7346), vec2(.7597, .7903), vec2(.7186, .8435), vec2(.6732, .8936), vec2(.6213, .9394), vec2(.5722, .9761), vec2(.5322, 1.));

vec2 robinson(float p) {
    float i = min(18., p * 36. / PI);
    int i0 = int(floor(i));
    float d = i - float(i0);
    vec2 a = K[i0], b = K[i0 + 1], c = K[min(19, i0 + 2)];
    return (b + d * (c - a) / 2. + d * d * (c - 2. * b + a) / 2.) * vec2(1., 1.593415793900743);
}

void main() {
    vec2 p = (gl_FragCoord.xy - view.xy) / view.z;
    float l, f;
    if (proj == 0) {
        l = p.x;
        f = abs(p.y) > PI ? PI : 2. * atan(exp(p.y)) - PI / 2.;
    } else if (proj == 1) {
        float lo = 0., hi = PI / 2.;
        for (int i = 0; i < 24; i++) {
            float mid = (lo + hi) / 2.;
            if (robinson(mid).y < abs(p.y)) lo = mid; else hi = mid;
        }
        f = abs(p.y) > robinson(PI / 2.).y ? PI : sign(p.y) * lo;
        l = p.x / robinson(lo).x;
    } else if (proj == 2) {
        l = p.x / sqrt(.5);
        f = abs(p.y) > sqrt(2.) ? PI : asin(p.y * sqrt(.5));
    } else {
        l = atan(p.x, -p.y);
        f = PI / 2. - length(p);
    }
    vec3 d = vec3(cos(f) * cos(l), cos(f) * sin(l), sin(f));
    color = abs(l) > PI || abs(f) > PI / 2. ? vec4(0.) : texture(tex, rot * d);
}`));
gl.linkProgram(program);
gl.useProgram(program);
const uniform = name => gl.getUniformLocation(program, name);

function draw() {
    projection.rotate(rotate);
    const w = canvas.width, h = canvas.height, path = geoPath(projection, ctx), political = style == 'political';
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = devicePixelRatio / 2;
    const fill = (object, color) => { ctx.beginPath(); path(object); ctx.fillStyle = color; ctx.fill(); };
    const stroke = (object, color) => { ctx.beginPath(); path(object); ctx.strokeStyle = color; ctx.stroke(); };
    if (political) {
        fill(sphere, '#b5d0e0');
        groups.forEach((group, i) => fill(group, palette[i]));
        if (borders) stroke(borders, 'rgba(70, 55, 45, .6)');
    } else {
        const [tx, ty] = projection.translate(), r = geoRotation(rotate);
        gl.viewport(0, 0, w, h);
        gl.uniform3f(uniform('view'), tx, h - ty, projection.scale());
        gl.uniform1i(uniform('proj'), proj);
        gl.uniformMatrix3fv(uniform('rot'), false, [[0, 0], [90, 0], [0, 90]].flatMap(p => versor.cartesian(r.invert(p))));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    stroke(graticule, political ? 'rgba(70, 55, 45, .18)' : 'rgba(255, 255, 255, .25)');
    glCanvas.hidden = political;
}

function resize() {
    projection = projections[proj];
    const [, [, height]] = geoPath(projection.fitWidth(1, sphere)).bounds(sphere);
    const w = Math.min(wrap.clientWidth, Math.max(300, innerHeight - 150) / height) * devicePixelRatio, h = w * height;
    for (const c of [canvas, glCanvas]) {
        c.width = w;
        c.height = h;
        c.style.width = w / devicePixelRatio + 'px';
    }
    projection.fitSize([w, h], sphere);
    draw();
}

function label() {
    const [lon, lat] = geoRotation(rotate).invert([0, 90]);
    const country = countries.find(c => geoContains(c, [lon, lat]));
    readout.textContent = `North Pole at ${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}${country ? ` (${country.properties.name})` : ''}`;
    history.replaceState(null, '', rotate.some(a => Math.abs(a) > .005) ? '#' + rotate.map(a => a.toFixed(2)) : location.pathname);
}

let frame;
function animate(target) {
    const q0 = versor(rotate), v0 = versor.cartesian(target), v1 = versor.cartesian(geoRotation(rotate).invert([0, 90]));
    const start = performance.now(), duration = 1500 * Math.sqrt(Math.acos(Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2])) / Math.PI) + 200;
    cancelAnimationFrame(frame);
    const step = now => {
        const t = Math.min(1, (now - start) / duration);
        rotate = versor.rotation(versor.multiply(q0, versor.delta(v0, v1, t * t * (3 - 2 * t))));
        draw();
        if (t < 1) frame = requestAnimationFrame(step); else label();
    };
    frame = requestAnimationFrame(step);
}

canvas.onclick = e => {
    const point = [e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio], target = projection.invert(point), back = projection(target);
    if (Math.hypot(back[0] - point[0], back[1] - point[1]) < 2) animate(target);
};
document.querySelector('.reset').onclick = () => animate([0, 90]);

for (const group of document.querySelectorAll('.choice')) group.onclick = e => {
    if (!e.target.value) return;
    group.querySelector('.active').classList.remove('active');
    e.target.classList.add('active');
    if (group.dataset.set == 'style') style = e.target.value; else proj = +e.target.value;
    resize();
};
addEventListener('resize', resize);
resize();
label();

fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json').then(r => r.json()).then(world => {
    const geometries = world.objects.countries.geometries, adjacent = neighbors(geometries), colors = [];
    countries = feature(world, world.objects.countries).features;
    countries.forEach((_, i) => colors[i] = palette.map((_, c) => (c + i) % palette.length).find(c => !adjacent[i].some(j => colors[j] == c)));
    groups = palette.map((_, c) => ({ type: 'FeatureCollection', features: countries.filter((_, i) => colors[i] == c) }));
    borders = mesh(world, world.objects.countries);
    draw();
    label();
});

Promise.all(['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(async name => {
    const image = new Image();
    image.src = `images/map/${name}.webp`;
    await image.decode();
    return image;
})).then(images => {
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, gl.createTexture());
    images.forEach((image, i) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image));
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const anisotropic = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropic) gl.texParameterf(gl.TEXTURE_CUBE_MAP, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    draw();
});
