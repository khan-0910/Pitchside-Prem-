import{a as e,h as t,n,o as r,p as i,r as a}from"./format-DEd3hiek.js";import{i as o,n as s,r as c,s as l}from"./identity-B7jpv6tR.js";import{l as u,m as d,t as f}from"./jsx-runtime-C2AI3Axu.js";import{t as p}from"./Radar-fv3_NAV0.js";import{PageTitle as m}from"./DashboardLayout-BTa7YCWT.js";import{t as h}from"./AnimatedNumber-CvlHh3xk.js";import{_ as g,g as _,x as v,y}from"./index-BvI3TfX1.js";import{n as b}from"./ShirtCard-CZfWFb_9.js";var x=d(u(),1),S=f(),C=[`bursts`,`stars`,`shards`,`cosmos`,`rainbow`,`swirl`,`glitter`,`gold`],w=1100,T=63/88,E=`#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`,D=`#version 300 es
precision highp float;

uniform sampler2D uArt;
uniform vec2 uSize;
uniform float uAspect;
uniform vec2 uTilt;
uniform vec2 uLight;
uniform float uDistance;
uniform int uPreset;
uniform float uIntensity;
uniform float uScale;
uniform float uEdge;
uniform float uFrame;
uniform float uRadius;
uniform float uGlare;
uniform vec3 uFoil;
uniform float uReady;

out vec4 outColor;

const float TAU = 6.28318530718;

struct Foil {
  float mask;
  float angle;
  float jitter;
  vec2 facet;
};

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p), hash(p + 17.31));
}

vec3 hue(float t) {
  t = abs(fract(t * 0.5) * 2.0 - 1.0);
  vec3 c = mix(vec3(0.1, 0.25, 1.0), vec3(0.0, 0.85, 1.0), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(0.25, 1.0, 0.2), smoothstep(0.25, 0.45, t));
  c = mix(c, vec3(1.0, 0.92, 0.05), smoothstep(0.45, 0.65, t));
  c = mix(c, vec3(1.0, 0.45, 0.05), smoothstep(0.65, 0.85, t));
  return mix(c, vec3(0.95, 0.12, 0.3), smoothstep(0.85, 1.0, t));
}

Foil bursts(vec2 p) {
  vec2 q = mat2(0.7071068, 0.7071068, -0.7071068, 0.7071068) * (p - vec2(0.5, 0.5 * uAspect)) / (0.283 / uScale);
  vec2 d = fract(q) - 0.5;
  float u = length(d) / 0.49;
  float angle = atan(d.y, d.x);
  if (u < 0.12) {
    float ring = min(floor(u / 0.045 + 0.5), 2.0);
    float count = max(1.0, ring * 6.0);
    float spot = (floor(angle / TAU * count) + 0.5) / count * TAU;
    vec2 dot = vec2(cos(spot), sin(spot)) * ring * 0.045;
    float m = smoothstep(0.024, 0.012, length(d / 0.49 - dot));
    return Foil(m, angle, 0.5, vec2(0.0));
  }
  bool inner = u < 0.66;
  float slot = angle / TAU * (inner ? 56.0 : 72.0);
  bool shifted = mod(floor(slot), 2.0) > 0.5;
  vec2 band = inner ? (shifted ? vec2(0.45, 0.61) : vec2(0.33, 0.49)) : (shifted ? vec2(0.84, 0.99) : vec2(0.7, 0.85));
  float across = abs(u - (band.x + band.y) * 0.5) / ((band.y - band.x) * 0.5);
  float along = abs(fract(slot) - 0.5) * 2.0;
  float width = inner ? 0.72 : 0.6;
  float m = smoothstep(1.0, 0.78, across) * smoothstep(width, width - 0.2, along);
  return Foil(m, angle, 0.5, vec2(0.0));
}

Foil stars(vec2 p) {
  Foil best = Foil(0.0, 0.0, 0.0, vec2(0.0));
  vec2 g = p / (0.08 / uScale);
  vec2 base = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      float pick = hash(id + 1.3);
      vec2 d = g - (id + 0.5 + (hash2(id) - 0.5) * 0.55);
      float m = smoothstep(0.07, 0.035, length(d));
      if (pick < 0.62) {
        float size = mix(0.16, 0.5, pow(hash(id + 9.0), 1.8));
        float sector = TAU / (pick < 0.3 ? 4.0 : 5.0);
        float k = abs(fract((atan(d.y, d.x) + hash(id + 4.0) * TAU) / sector) - 0.5) * 2.0;
        float edge = size * mix(1.0, 0.36, pow(k, 0.6));
        m = smoothstep(edge, edge * 0.8, length(d));
      }
      if (m > best.mask) best = Foil(m, hash(id + 6.0) * TAU, hash(id + 8.0), (hash2(id + 2.0) - 0.5) * 0.6);
    }
  }
  return best;
}

Foil shards(vec2 p) {
  vec2 g = p * 19.0 * uScale;
  vec2 base = floor(g);
  float best = 9.0;
  float second = 9.0;
  vec2 id = base;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = base + vec2(float(i), float(j));
      float d = length(cell + 0.08 + hash2(cell) * 0.84 - g);
      if (d < best) {
        second = best;
        best = d;
        id = cell;
      } else if (d < second) {
        second = d;
      }
    }
  }
  float crack = smoothstep(0.015, 0.07, second - best);
  float shine = 0.25 + 0.75 * pow(hash(id + 7.7), 2.0);
  return Foil((0.2 + 0.8 * crack) * shine, hash(id + 3.17) * TAU, hash(id + 11.73), (hash2(id + 5.0) - 0.5) * 0.5);
}

Foil cosmos(vec2 p) {
  Foil best = Foil(0.0, 0.0, 0.0, vec2(0.0));
  vec2 g = p / (0.16 / uScale);
  vec2 base = floor(g);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      vec2 d = g - (id + 0.5 + (hash2(id) - 0.5) * 0.7);
      float size = mix(0.16, 0.52, hash(id + 2.0));
      float r = length(d);
      float m = max(smoothstep(0.05, 0.0, abs(r - size)), smoothstep(size, size - 0.04, r) * 0.22);
      if (m > best.mask) best = Foil(m, hash(id + 6.0) * TAU + atan(d.y, d.x) * 0.5, hash(id + 1.0), (hash2(id + 4.0) - 0.5) * 0.5);
    }
  }
  vec2 fine = p / (0.035 / uScale);
  vec2 cell = floor(fine);
  float dots = smoothstep(0.2, 0.1, length(fine - cell - 0.5 - (hash2(cell + 9.0) - 0.5) * 0.6)) * step(0.55, hash(cell + 2.0));
  if (dots > best.mask) best = Foil(dots, hash(cell) * TAU, hash(cell + 3.0), (hash2(cell + 7.0) - 0.5) * 0.6);
  return best;
}

Foil rainbow(vec2 p) {
  return Foil(0.86 + 0.14 * hash(floor(p * 700.0 * uScale)), 0.2, 0.5, vec2(0.0));
}

Foil swirl(vec2 p) {
  vec2 d = p - vec2(0.5, 0.42 * uAspect);
  float angle = atan(d.y, d.x);
  float rays = 0.55 + 0.45 * smoothstep(0.3, 0.7, abs(fract(angle / TAU * 60.0 * uScale) - 0.5) * 2.0);
  return Foil(rays, angle, length(d), vec2(0.0));
}

Foil glitter(vec2 p) {
  vec2 g = p * 72.0 * uScale;
  vec2 cell = floor(g);
  float size = mix(0.18, 0.4, hash(cell + 3.0));
  float m = smoothstep(size, size * 0.55, length(fract(g) - 0.5 - (hash2(cell) - 0.5) * 0.5)) * step(0.25, hash(cell + 5.0));
  return Foil(m, hash(cell + 7.0) * TAU, hash(cell + 9.0), (hash2(cell + 11.0) - 0.5) * 0.9);
}

Foil gold(vec2 p) {
  Foil flake = glitter(p * 0.8);
  if (flake.mask > 0.5) return flake;
  float etch = 0.55 + 0.45 * smoothstep(0.2, 0.8, abs(fract((p.x * 0.6 + p.y) * 140.0 * uScale) - 0.5) * 2.0);
  return Foil(etch, 0.9, 0.4, vec2(0.0));
}

vec3 sparkles(vec2 p, vec3 halfway, vec2 sweep, float awake) {
  vec2 g = p * 62.0;
  vec2 cell = floor(g);
  vec2 d = fract(g) - 0.5 - (hash2(cell) - 0.5) * 0.36;
  float spin = hash(cell + 3.0) * TAU;
  d = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * d;
  vec2 a = abs(d);
  float hexagon = max(a.x * 0.866 + a.y * 0.5, a.y);
  float size = mix(0.22, 0.38, hash(cell + 2.0));
  float piece = smoothstep(size, size - 0.07, hexagon) * step(0.42, hash(cell + 4.0));
  vec3 facet = normalize(vec3((hash2(cell + 6.0) - 0.5) * 0.9, 1.0));
  float flash = pow(max(dot(facet, halfway), 0.0), 6.0);
  vec3 tint = hue(dot(sweep, vec2(cos(spin), sin(spin))) * 1.2 + dot(sweep, vec2(0.8, 0.6)) * 0.8 + hash(cell + 8.0) * 0.5);
  vec3 color = piece * tint * (0.3 + 1.6 * flash) * awake;
  vec2 fine = p * 210.0;
  vec2 speckCell = floor(fine);
  float speck = smoothstep(0.24, 0.0, length(fract(fine) - 0.5 - (hash2(speckCell) - 0.5) * 0.5)) * step(0.72, hash(speckCell + 1.0));
  float speckFlash = pow(max(dot(normalize(vec3((hash2(speckCell + 2.0) - 0.5) * 0.9, 1.0)), halfway), 0.0), 10.0);
  return color + vec3(1.2) * speck * speckFlash * (1.0 - piece);
}

void main() {
  vec2 uv = vec2(gl_FragCoord.x / uSize.x, 1.0 - gl_FragCoord.y / uSize.y);
  vec2 p = vec2(uv.x, uv.y * uAspect);
  vec2 center = vec2(0.5, 0.5 * uAspect);
  vec2 q = abs(p - center) - center + uRadius;
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float pixel = 1.0 / uSize.x;
  float alpha = clamp(0.5 - outside / pixel, 0.0, 1.0);
  vec4 sampled = texture(uArt, uv);
  if (uReady > 0.5) alpha *= sampled.a;
  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  vec3 art = uReady > 0.5 ? pow(sampled.rgb, vec3(2.2)) : vec3(0.12);

  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(uTilt.x), sin(uTilt.x), 0.0, -sin(uTilt.x), cos(uTilt.x));
  mat3 ry = mat3(cos(uTilt.y), 0.0, -sin(uTilt.y), 0.0, 1.0, 0.0, sin(uTilt.y), 0.0, cos(uTilt.y));
  mat3 turn = rx * ry;
  vec3 world = turn * vec3(p - center, 0.0);
  vec3 view = normalize(transpose(turn) * (vec3(0.0, 0.0, uDistance) - world));
  vec3 lamp = vec3((uLight - 0.5) * vec2(1.1, 1.1 * uAspect), 0.9);
  vec3 light = normalize(transpose(turn) * (lamp - world));
  vec3 halfway = normalize(light + view);
  vec2 sweep = light.xy + view.xy;
  float sheen = pow(max(halfway.z, 0.0), 10.0);
  float shine = pow(max(halfway.z, 0.0), 80.0);
  float frame = 1.0 - smoothstep(uFrame - pixel, uFrame + pixel, -outside);

  Foil f;
  if (uPreset == 0) f = bursts(p);
  else if (uPreset == 1) f = stars(p);
  else if (uPreset == 2) f = shards(p);
  else if (uPreset == 3) f = cosmos(p);
  else if (uPreset == 4) f = rainbow(p);
  else if (uPreset == 5) f = swirl(p);
  else if (uPreset == 6) f = glitter(p);
  else f = gold(p);

  vec3 metal = uPreset == 7 ? vec3(1.0, 0.74, 0.38) * dot(uFoil, vec3(0.3333)) * 1.15 : uFoil;
  vec4 look = uPreset == 0 ? vec4(0.25, 1.9, 0.12, 1.0)
    : uPreset == 1 ? vec4(0.6, 1.4, 0.3, 1.0)
    : uPreset == 2 ? vec4(0.9, 0.9, 0.6, 0.5)
    : uPreset == 3 ? vec4(0.7, 1.2, 0.35, 0.85)
    : uPreset == 4 ? vec4(0.0, 2.2, 0.0, 0.45)
    : uPreset == 5 ? vec4(1.6, 0.3, 0.0, 0.4)
    : uPreset == 6 ? vec4(0.9, 1.0, 0.6, 1.0)
    : vec4(0.3, 1.0, 0.2, 0.95);
  vec2 dir = vec2(cos(f.angle), sin(f.angle));
  float phase = dot(sweep, dir) * look.x + dot(sweep, vec2(0.8, 0.6)) * look.y + f.jitter * look.z;
  float spoke = 1.0;
  if (uPreset == 5) {
    float facing = dot(normalize(sweep + 0.0001), dir);
    phase = f.jitter * 2.4 + facing * 0.6 + length(sweep) * 0.8;
    spoke = 0.3 + 0.7 * smoothstep(0.25, 0.95, abs(facing));
  }
  vec3 tint = hue(phase);
  if (uPreset == 7) tint = mix(tint, metal, 0.65);
  float glint = pow(max(dot(normalize(vec3(f.facet, 1.0)), halfway), 0.0), 24.0) * step(0.001, length(f.facet));
  bool layered = uPreset == 2 || uPreset == 4 || uPreset == 5 || uPreset == 7;
  vec3 foil = (layered ? tint : mix(tint, vec3(1.0), 0.12)) * (1.15 + 0.3 * sheen) + metal * glint * 1.2;
  float tilted = smoothstep(0.02, 0.21, length(sin(uTilt)));
  float awake = mix(0.2, 1.0, tilted);
  float strength = uIntensity * f.mask * (1.0 - frame) * awake;
  float band = uPreset == 5 ? spoke : layered ? 0.25 + 0.75 * smoothstep(0.3, 0.95, 0.5 + 0.5 * cos(phase * TAU * 0.5 + 1.3)) : 1.0;
  vec3 color = layered
    ? 1.0 - (1.0 - art) * (1.0 - clamp(foil * look.w * band * strength, 0.0, 1.0))
    : mix(art, foil, clamp(strength * look.w, 0.0, 1.0));
  color += sparkles(p, halfway, sweep, mix(0.55, 1.0, tilted)) * uEdge * frame;
  color += uFoil * sheen * 0.12 * frame;
  color += vec3(sheen * 0.07 + shine * 0.3) * uGlare;
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
  outColor = vec4(color * alpha, alpha);
}
`,O=(e,t,n)=>Math.min(n,Math.max(t,e)),k=e=>{let t=[.78,.8,.84];if(typeof document>`u`)return t;let n=document.createElement(`canvas`).getContext(`2d`);if(!n)return t;n.fillStyle=`#000000`,n.fillStyle=e;let r=n.fillStyle;return!r.startsWith(`#`)||r.length!==7?t:[1,3,5].map(e=>(parseInt(r.slice(e,e+2),16)/255)**2.2)},A=(e,t,n)=>{let r=e.createShader(t);return r?(e.shaderSource(r,n),e.compileShader(r),e.getShaderParameter(r,e.COMPILE_STATUS)?r:(e.deleteShader(r),null)):null};function j({image:e,backImage:t,alt:n=``,preset:r=`bursts`,intensity:i=.85,scale:a=1,edgeSparkle:o=.8,frame:s=4,glare:c=.5,foilColor:l=`#e2e6ec`,width:u=320,radius:d=14,tiltMax:f=14,hoverScale:p=1.04,idle:m=!0,shadow:h=!0,className:g=``,style:_}){let v=(0,x.useRef)(null),y=(0,x.useRef)(null),b=(0,x.useRef)(null),j=(0,x.useRef)(null),M=(0,x.useRef)(null),N=(0,x.useRef)({x:.5,y:.5,inside:!1}),P=(0,x.useRef)(null),F=(0,x.useRef)(null),I=(0,x.useRef)(!1),[L,R]=(0,x.useState)(T),[z,B]=(0,x.useState)(!1),[V,H]=(0,x.useState)(!1),U=!!t;M.current={preset:Math.max(0,C.indexOf(r)),intensity:O(i,0,1),scale:O(a,.25,4),edgeSparkle:O(o,0,1),frame:O(s,0,20)/100,glare:O(c,0,1),foil:k(l),radius:Math.max(0,d),tiltMax:O(f,0,45),hoverScale:O(p,.8,1.3),idle:m},I.current=U&&V,(0,x.useEffect)(()=>{P.current?.()}),(0,x.useEffect)(()=>{F.current?.(e)},[e]),(0,x.useEffect)(()=>{let t=v.current,n=y.current,r=j.current;if(!t||!n||!r)return;let i=window.matchMedia?.(`(prefers-reduced-motion: reduce)`).matches??!1,a=r.getContext(`webgl2`,{alpha:!0,premultipliedAlpha:!0,antialias:!1}),o=null,s=null,c=null,l={},u=!1;if(a){let e=A(a,a.VERTEX_SHADER,E),t=A(a,a.FRAGMENT_SHADER,D);if(e&&t&&(o=a.createProgram(),a.attachShader(o,e),a.attachShader(o,t),a.bindAttribLocation(o,0,`position`),a.linkProgram(o),a.deleteShader(e),a.deleteShader(t),a.getProgramParameter(o,a.LINK_STATUS)||(a.deleteProgram(o),o=null)),o){c=a.createBuffer(),a.bindBuffer(a.ARRAY_BUFFER,c),a.bufferData(a.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),a.STATIC_DRAW),a.enableVertexAttribArray(0),a.vertexAttribPointer(0,2,a.FLOAT,!1,0,0),s=a.createTexture(),a.bindTexture(a.TEXTURE_2D,s),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MIN_FILTER,a.LINEAR_MIPMAP_LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_MAG_FILTER,a.LINEAR),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_S,a.CLAMP_TO_EDGE),a.texParameteri(a.TEXTURE_2D,a.TEXTURE_WRAP_T,a.CLAMP_TO_EDGE),a.texImage2D(a.TEXTURE_2D,0,a.RGBA,1,1,0,a.RGBA,a.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));for(let e of[`uArt`,`uSize`,`uAspect`,`uTilt`,`uLight`,`uDistance`,`uPreset`,`uIntensity`,`uScale`,`uEdge`,`uFrame`,`uRadius`,`uGlare`,`uFoil`,`uReady`])l[e]=a.getUniformLocation(o,e)}}let d={tiltX:0,tiltY:0,tiltVX:0,tiltVY:0,lightX:.36,lightY:.26,lightVX:0,lightVY:0,lift:1,liftV:0,turn:0,turnV:0,clock:Math.random()*40},f=0,p=0,m=!0,h=!0,g=0,_=()=>{if(!a||!o)return;let e=M.current,t=r.width,n=r.height;t&&n&&(a.viewport(0,0,t,n),a.clearColor(0,0,0,0),a.clear(a.COLOR_BUFFER_BIT),a.useProgram(o),a.activeTexture(a.TEXTURE0),a.bindTexture(a.TEXTURE_2D,s),a.uniform1i(l.uArt,0),a.uniform2f(l.uSize,t,n),a.uniform1f(l.uAspect,n/t),a.uniform2f(l.uTilt,d.tiltX*Math.PI/180,(d.tiltY+d.turn)*Math.PI/180),a.uniform2f(l.uLight,d.lightX,d.lightY),a.uniform1f(l.uDistance,w/Math.max(1,r.clientWidth)),a.uniform1i(l.uPreset,e.preset),a.uniform1f(l.uIntensity,e.intensity),a.uniform1f(l.uScale,e.scale),a.uniform1f(l.uEdge,e.edgeSparkle),a.uniform1f(l.uFrame,e.frame),a.uniform1f(l.uRadius,e.radius/Math.max(1,r.clientWidth)),a.uniform1f(l.uGlare,e.glare),a.uniform3f(l.uFoil,e.foil[0],e.foil[1],e.foil[2]),a.uniform1f(l.uReady,+!!u),a.drawArrays(a.TRIANGLES,0,3))},x=(e,t,n,r,i,a)=>{let o=t+((n-e)*r-t*i)*a;return[e+o*a,o]},S=e=>{if(f=0,!h)return;let t=Math.min(1/30,Math.max(1/240,(e-p)/1e3));p=e;let r=M.current,a=N.current,o=0,s=0,c=.36,l=.26,u=1,v=r.idle&&!i&&!a.inside;if(a.inside&&!i)o=(.5-a.y)*2*r.tiltMax,s=(a.x-.5)*2*r.tiltMax,c=a.x,l=a.y,u=r.hoverScale;else if(v){d.clock+=t;let e=d.clock;o=Math.sin(e*.7)*r.tiltMax*.28,s=Math.sin(e*.53+1.2)*r.tiltMax*.4,c=.5+Math.sin(e*.41)*.42,l=.38+Math.sin(e*.33+.6)*.3}let y=Math.ceil(t/(1/240)),C=t/y;for(let e=0;e<y;e++)[d.tiltX,d.tiltVX]=x(d.tiltX,d.tiltVX,o,150,16,C),[d.tiltY,d.tiltVY]=x(d.tiltY,d.tiltVY,s,150,16,C),[d.lightX,d.lightVX]=x(d.lightX,d.lightVX,c,220,30,C),[d.lightY,d.lightVY]=x(d.lightY,d.lightVY,l,220,30,C),[d.lift,d.liftV]=x(d.lift,d.liftV,u,320,30,C),[d.turn,d.turnV]=i?[I.current?180:0,0]:x(d.turn,d.turnV,I.current?180:0,170,20,C);n.style.transform=`perspective(${w}px) scale(${d.lift}) rotateX(${d.tiltX}deg) rotateY(${d.tiltY+d.turn}deg)`,b.current&&(b.current.style.transform=`translate(${-d.tiltY*.7}px, ${d.tiltX*.7}px) scale(${.9+(d.lift-1)*1.5})`),Math.cos((d.tiltY+d.turn)*Math.PI/180)>-.05&&_(),g=Math.abs(d.tiltVX)+Math.abs(d.tiltVY)+Math.abs(d.liftV)*40+Math.abs(d.turnV)+(Math.abs(d.lightVX)+Math.abs(d.lightVY))*60+Math.abs(d.tiltX-o)+Math.abs(d.tiltY-s)>.02?0:g+t,!m||!v&&!a.inside&&g>.3||(f=requestAnimationFrame(S))},C=()=>{!f&&h&&(g=0,p=performance.now(),f=requestAnimationFrame(S))};P.current=C;let T=()=>{let e=Math.min(window.devicePixelRatio||1,2),t=Math.max(1,Math.round(r.clientWidth*e)),n=Math.max(1,Math.round(r.clientHeight*e));(r.width!==t||r.height!==n)&&(r.width=t,r.height=n),_(),C()};F.current=e=>{if(u=!1,B(!1),!e)return;let t=new Image;t.crossOrigin=`anonymous`,t.decoding=`async`,t.onload=()=>{if(h&&(t.naturalWidth&&t.naturalHeight&&R(t.naturalWidth/t.naturalHeight),a&&o))try{a.bindTexture(a.TEXTURE_2D,s),a.pixelStorei(a.UNPACK_FLIP_Y_WEBGL,!1),a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),a.texImage2D(a.TEXTURE_2D,0,a.RGBA,a.RGBA,a.UNSIGNED_BYTE,t),a.generateMipmap(a.TEXTURE_2D),u=!0,B(!0),_(),C()}catch{u=!1}},t.src=e},F.current(e);let O=new ResizeObserver(T);O.observe(r);let k=new IntersectionObserver(e=>{m=e.some(e=>e.isIntersecting),m&&C()});return k.observe(t),T(),()=>{h=!1,cancelAnimationFrame(f),P.current=null,F.current=null,O.disconnect(),k.disconnect(),a&&(a.deleteTexture(s),a.deleteBuffer(c),a.deleteProgram(o))}},[]);let W=e=>{if(e.pointerType===`touch`&&e.type===`pointermove`&&!e.buttons)return;let t=e.currentTarget.getBoundingClientRect();N.current={x:O((e.clientX-t.left)/t.width,0,1),y:O((e.clientY-t.top)/t.height,0,1),inside:!0},P.current?.()},G=()=>{N.current={...N.current,inside:!1},P.current?.()},K=()=>{U&&H(e=>!e)};return(0,S.jsxs)(`div`,{ref:v,className:`relative inline-block w-[var(--hc-w)] max-w-full aspect-[var(--hc-ratio)] rounded-[var(--hc-radius)] outline-none select-none touch-pan-y [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] ${U?`cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[6px] focus-visible:outline-current`:``}${g?` ${g}`:``}`,role:U?`button`:`img`,tabIndex:U?0:void 0,"aria-label":n||void 0,"aria-pressed":U?V:void 0,"data-ready":z?``:void 0,"data-flippable":U?``:void 0,onPointerEnter:W,onPointerMove:W,onPointerDown:W,onPointerLeave:G,onPointerCancel:G,onClick:K,onKeyDown:e=>{!U||e.key!==`Enter`&&e.key!==` `||(e.preventDefault(),e.repeat||K())},style:{"--hc-w":`${u}px`,"--hc-ratio":L,"--hc-radius":`${d}px`,..._},children:[h?(0,S.jsx)(`span`,{ref:b,className:`absolute inset-[10%_7%_-4%] rounded-[var(--hc-radius)] bg-black/40 blur-[26px] pointer-events-none will-change-transform`,"aria-hidden":`true`}):null,(0,S.jsxs)(`div`,{ref:y,className:`absolute inset-0 [transform-style:preserve-3d] will-change-transform`,children:[(0,S.jsxs)(`div`,{className:`absolute inset-0 overflow-hidden rounded-[var(--hc-radius)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]`,children:[e?(0,S.jsx)(`img`,{src:e,alt:``,draggable:!1,className:`absolute inset-0 block h-full w-full object-cover pointer-events-none [-webkit-user-drag:none]`}):null,(0,S.jsx)(`canvas`,{ref:j,className:`absolute inset-0 block h-full w-full transition-opacity duration-300 ${z?`opacity-100`:`opacity-0`}`})]}),U?(0,S.jsx)(`div`,{className:`absolute inset-0 overflow-hidden rounded-[var(--hc-radius)] [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)]`,children:(0,S.jsx)(`img`,{src:t,alt:``,draggable:!1,className:`absolute inset-0 block h-full w-full object-cover pointer-events-none [-webkit-user-drag:none]`})}):null]})]})}var M=320,N=448,P=e=>e.replace(/[&<>"']/g,e=>`&#${e.charCodeAt(0)};`),F=e=>`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${M}" height="${N}" viewBox="0 0 ${M} ${N}" font-family="Archivo, Arial, sans-serif">${e}</svg>`)}`,I=(e,t=0)=>e==null?`–`:e.toFixed(t);function L(t){let[n,i]=c(t.tla),a=o(n),s=[[`MIN`,I(t.minutes)],[`G`,I(t.goals)],[`A`,I(t.assists)],[`xG`,I(t.xg,1)],[`xA`,I(t.xa,1)],[`VALUE`,t.market_value_eur?e(t.market_value_eur):`–`]];return F(`
    <rect width="${M}" height="${N}" fill="#0f1512"/>
    <rect x="10" y="10" width="300" height="428" rx="10" fill="${n}"/>
    <path d="M10 250 L310 200 V428 a10 10 0 0 1 -10 10 H20 a10 10 0 0 1 -10 -10Z" fill="#0f1512" opacity=".88"/>
    <text x="26" y="52" fill="${a}" font-size="34" font-weight="900" font-style="italic">${P(t.tla)}</text>
    <text x="26" y="76" fill="${a}" font-size="15" font-weight="700" opacity=".85">${P((t.profile?.position_name??t.position??``).toUpperCase())}</text>
    <circle cx="250" cy="115" r="62" fill="${i}" opacity=".9"/>
    <text x="250" y="133" text-anchor="middle" fill="${o(i)}" font-size="50" font-weight="900" font-style="italic">${P(r(t.name))}</text>
    <text x="26" y="${t.name.length>18?268:272}" fill="#fff" font-size="${t.name.length>18?21:26}" font-weight="900">${P(t.name)}</text>
    <text x="26" y="296" fill="#ffd400" font-size="14" font-weight="700">${P(t.profile?.role??t.team)}</text>
    ${s.map(([e,t],n)=>{let r=26+n%3*96,i=340+Math.floor(n/3)*56;return`<text x="${r}" y="${i}" fill="#fff" font-size="${e===`VALUE`?19:24}" font-weight="900">${P(t)}</text><text x="${r}" y="${i+18}" fill="#9fb3a6" font-size="11" font-weight="700" letter-spacing="1.5">${e}</text>`}).join(``)}
  `)}function R(e){let t=(e.profile?.radar??[]).slice(0,7);return F(`
    <rect width="${M}" height="${N}" rx="14" fill="#0f1512"/>
    <text x="24" y="44" fill="#ffd400" font-size="15" font-weight="800" letter-spacing="1">PER 90, PERCENTILE</text>
    <text x="24" y="66" fill="#9fb3a6" font-size="12">Against ${P(e.profile?.position_name?.toLowerCase()??`their position`)}s this season</text>
    ${t.length===0?`<text x="24" y="120" fill="#fff" font-size="15">Not enough minutes for a profile</text>`:t.map((e,t)=>{let n=104+t*46,r=Math.max(4,e.percentile/100*200);return`<text x="24" y="${n}" fill="#fff" font-size="14" font-weight="700">${P(e.label)}</text>
        <rect x="24" y="${n+8}" width="200" height="10" rx="5" fill="#26302b"/>
        <rect x="24" y="${n+8}" width="${r}" height="10" rx="5" fill="${e.percentile>=70?`#38c172`:`#b9c1bb`}"/>
        <text x="296" y="${n+18}" text-anchor="end" fill="#fff" font-size="16" font-weight="900">${e.percentile.toFixed(0)}</text>`}).join(``)}
    <text x="24" y="426" fill="#9fb3a6" font-size="11">Tap to flip back</text>
  `)}function z({player:e}){return i()?(0,S.jsx)(b,{tla:e.tla,label:r(e.name),size:84}):(0,S.jsx)(j,{image:L(e),backImage:R(e),alt:`${e.name} card. Press to flip to per 90 rankings.`,preset:`shards`,intensity:.3,width:220,tiltMax:12})}function B(e,t){return t.map(t=>({...t,percentile:e.profile?.percentiles[t.stat]??0,per90:e.profile?.per90[t.stat]??0}))}function V({a:e,b:n}){let r=t({queryKey:[`compare`,e.player_id,n.player_id],queryFn:()=>v.compare(e.player_id,n.player_id)}),i=e.profile?.radar??[];return(0,S.jsxs)(`div`,{className:`mt-4`,children:[(0,S.jsx)(p,{title:`${e.name} compared with ${n.name}`,series:[{name:e.name,axes:i,color:`#0B7A43`},{name:n.name,axes:B(n,i),color:`#0F1512`}]}),(0,S.jsx)(_,{query:r,loading:(0,S.jsx)(y,{rows:3}),children:t=>(0,S.jsxs)(S.Fragment,{children:[t.note&&(0,S.jsx)(`p`,{className:`text-muted`,children:t.note}),t.explanation&&(0,S.jsxs)(`div`,{className:`mt-3 grid gap-4 sm:grid-cols-2`,children:[(0,S.jsx)(H,{title:`Shared strengths`,rows:t.explanation.shared_strengths,a:e.name,b:n.name,empty:`No shared strength stands out.`}),(0,S.jsx)(H,{title:`Main differences`,rows:t.explanation.main_differences,a:e.name,b:n.name,empty:`No large difference stands out.`})]})]})})]})}function H({title:e,rows:t,a:n,b:r,empty:i}){return(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`h3`,{className:`text-sm`,children:e}),t.length===0&&(0,S.jsx)(`p`,{className:`text-sm text-muted`,children:i}),(0,S.jsx)(`ul`,{children:t.map(e=>(0,S.jsxs)(`li`,{className:`chalk flex justify-between gap-3 border-b py-1 text-sm`,children:[(0,S.jsx)(`span`,{className:`text-muted`,children:e.label}),(0,S.jsxs)(`span`,{className:`num`,title:`${n} / ${r}, per 90`,children:[e.a_per90.toFixed(2),` / `,e.b_per90.toFixed(2)]})]},e.stat))})]})}function U({player:e,onCompare:n,compared:r}){let[a,o]=(0,x.useState)(!1),[c,u]=(0,x.useState)(``),d=i(),f=t({queryKey:[`similar`,e.player_id,a,c],queryFn:()=>v.similar(e.player_id,{limit:8,exclude_team:!a,age_max:c})});return(0,S.jsxs)(`section`,{className:`mt-7`,children:[(0,S.jsxs)(`div`,{className:`flex flex-wrap items-end justify-between gap-3`,children:[(0,S.jsx)(`h3`,{className:`text-lg`,children:`Similar players`}),(0,S.jsxs)(`div`,{className:`flex flex-wrap items-center gap-3 text-sm`,children:[(0,S.jsxs)(`label`,{className:`flex min-h-11 items-center gap-2`,children:[(0,S.jsx)(`input`,{type:`checkbox`,className:`size-4 accent-[#0B7A43]`,checked:a,onChange:e=>o(e.target.checked)}),`Include teammates`]}),(0,S.jsxs)(`label`,{className:`text-muted`,children:[`Age at most`,(0,S.jsx)(`input`,{type:`number`,min:16,max:45,className:`field ml-2 !w-20 text-ink`,value:c,onChange:e=>u(e.target.value)})]})]})]}),(0,S.jsx)(_,{query:f,isEmpty:e=>e.items.length===0,empty:(0,S.jsx)(g,{title:f.data?.note??`No comparable players fit these filters.`}),children:e=>(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)(`ul`,{className:`mt-2`,children:e.items.map((e,t)=>(0,S.jsxs)(l.li,{initial:!d&&{opacity:0,x:-8},animate:{opacity:1,x:0},transition:{delay:d?0:t*.04},className:`chalk flex items-center gap-3 border-b py-2`,children:[(0,S.jsx)(s,{name:e.name,size:36}),(0,S.jsxs)(`div`,{className:`min-w-0 flex-1`,children:[(0,S.jsx)(`p`,{className:`truncate`,children:e.name}),(0,S.jsxs)(`p`,{className:`truncate text-sm text-muted`,children:[e.team_short,`, `,e.age??`age unknown`,`, `,e.role]})]}),(0,S.jsx)(`span`,{className:`num w-12 text-right font-display text-2xl font-semibold`,children:e.similarity_score.toFixed(0)}),(0,S.jsx)(`button`,{type:`button`,"aria-label":`Compare with ${e.name}`,"aria-pressed":r===e.player_id,className:r===e.player_id?`btn-primary`:`btn-ghost`,onClick:()=>n(e.player_id),children:`Compare`})]},e.player_id))}),(0,S.jsx)(`p`,{className:`mt-2 text-sm text-muted`,children:e.score_note})]})})]})}var W=e=>e.toFixed(1),G=(e,t)=>e===null?(0,S.jsx)(`span`,{className:`text-muted`,children:`No data`}):(0,S.jsx)(h,{value:e,format:t});function K({id:r}){let[a,o]=(0,x.useState)(null),s=t({queryKey:[`player`,r],queryFn:()=>v.player(r)}),c=t({queryKey:[`player`,a],queryFn:()=>v.player(a),enabled:!!a}),u=i();return(0,S.jsx)(_,{query:s,children:t=>(0,S.jsxs)(`article`,{className:`board`,children:[(0,S.jsxs)(`header`,{className:`flex flex-wrap items-end gap-x-6 gap-y-4`,children:[(0,S.jsx)(l.div,{initial:!u&&{y:40,opacity:0,rotate:-6},animate:{y:0,opacity:1,rotate:0},transition:{type:`spring`,stiffness:260,damping:22},children:(0,S.jsx)(z,{player:t})}),(0,S.jsxs)(`div`,{className:`min-w-0`,children:[(0,S.jsx)(`h2`,{className:`truncate text-2xl`,children:t.name}),(0,S.jsxs)(`p`,{className:`text-muted`,children:[t.team,`, `,t.age??`age unknown`,t.profile?`, ${t.profile.role}`:``]})]})]}),(0,S.jsx)(`dl`,{className:`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4`,children:[[`Minutes`,G(t.minutes)],[`Goals, assists`,(0,S.jsxs)(S.Fragment,{children:[G(t.goals),`, `,G(t.assists)]})],[`xG, xA`,(0,S.jsxs)(S.Fragment,{children:[G(t.xg,W),`, `,G(t.xa,W)]})],[`Recorded value`,G(t.market_value_eur,e)]].map(([e,t])=>(0,S.jsxs)(`div`,{children:[(0,S.jsx)(`dt`,{className:`text-sm text-muted`,children:e}),(0,S.jsx)(`dd`,{className:`num text-xl`,children:t})]},e))}),(0,S.jsxs)(`p`,{className:`mt-2 text-sm text-muted`,children:[`This season's observed FPL statistics. `,n[t.availability??`a`]??`Availability unknown`,t.news[0]?.news?`: ${t.news[0].news}`:`.`]}),t.profile?a&&c.data?(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)(`button`,{type:`button`,className:`mt-3 text-sm text-muted underline underline-offset-4`,onClick:()=>o(null),children:`Clear comparison`}),(0,S.jsx)(V,{a:t,b:c.data})]}):(0,S.jsxs)(`div`,{className:`mt-4`,children:[(0,S.jsx)(p,{title:t.name,series:[{name:t.name,axes:t.profile.radar,color:`#0B7A43`}]}),(0,S.jsxs)(`table`,{className:`mt-3 w-full max-w-md text-sm`,children:[(0,S.jsx)(`caption`,{className:`sr-only`,children:`Per 90 values and percentiles`}),(0,S.jsx)(`tbody`,{className:`num`,children:t.profile.radar.map(e=>(0,S.jsxs)(`tr`,{className:`chalk border-b`,children:[(0,S.jsx)(`th`,{scope:`row`,className:`py-1 text-left font-normal text-muted`,children:e.label}),(0,S.jsxs)(`td`,{className:`py-1 text-right`,children:[e.per90.toFixed(2),` per 90`]}),(0,S.jsxs)(`td`,{className:`py-1 text-right`,children:[e.percentile.toFixed(0),`th`]})]},e.stat))})]})]}):(0,S.jsx)(g,{title:t.profile_note??`No profile yet.`}),t.profile&&(0,S.jsx)(U,{player:t,compared:a,onCompare:o})]})})}function q(){let[e,n]=(0,x.useState)(``),[r,i]=(0,x.useState)(``),[o,s]=(0,x.useState)(``),[c,l]=(0,x.useState)(``),[u,d]=(0,x.useState)(``),[f,p]=(0,x.useState)(`450`),[h,y]=(0,x.useState)(null),b=(0,x.useDeferredValue)(e),C=t({queryKey:[`teams`],queryFn:v.teams}),w=t({queryKey:[`players`,b,r,o,c,u,f],queryFn:()=>v.players({q:b,position_group:r,team:o,age_min:c,age_max:u,min_minutes:f,limit:30}),placeholderData:e=>e}),T=h??w.data?.items[0]?.player_id??null;return(0,S.jsxs)(S.Fragment,{children:[(0,S.jsx)(m,{title:`Player Lab`,intro:`Search any current player, read their per-90 profile and find who plays like them.`}),(0,S.jsxs)(`div`,{className:`grid gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]`,children:[(0,S.jsxs)(`section`,{"aria-label":`Find a player`,children:[(0,S.jsxs)(`label`,{className:`block text-sm text-muted`,children:[`Search by name`,(0,S.jsx)(`input`,{type:`search`,className:`field mt-0.5 text-ink`,placeholder:`Saka`,value:e,onChange:e=>n(e.target.value)})]}),(0,S.jsxs)(`div`,{className:`mt-2 grid grid-cols-2 gap-2`,children:[(0,S.jsxs)(`label`,{className:`col-span-2 text-sm text-muted`,children:[`Position`,(0,S.jsxs)(`select`,{className:`field mt-0.5 text-ink`,value:r,onChange:e=>i(e.target.value),children:[(0,S.jsx)(`option`,{value:``,children:`All positions`}),Object.entries(a).map(([e,t])=>(0,S.jsx)(`option`,{value:e,children:t},e))]})]}),(0,S.jsxs)(`label`,{className:`col-span-2 text-sm text-muted`,children:[`Club`,(0,S.jsxs)(`select`,{className:`field mt-0.5 text-ink`,value:o,onChange:e=>s(e.target.value),children:[(0,S.jsx)(`option`,{value:``,children:`All clubs`}),C.data?.map(e=>(0,S.jsx)(`option`,{value:e.team_id,children:e.name},e.team_id))]})]}),(0,S.jsxs)(`label`,{className:`text-sm text-muted`,children:[`Age from`,(0,S.jsx)(`input`,{type:`number`,min:15,max:45,className:`field mt-0.5 text-ink`,value:c,onChange:e=>l(e.target.value)})]}),(0,S.jsxs)(`label`,{className:`text-sm text-muted`,children:[`Age to`,(0,S.jsx)(`input`,{type:`number`,min:15,max:45,className:`field mt-0.5 text-ink`,value:u,onChange:e=>d(e.target.value)})]}),(0,S.jsxs)(`label`,{className:`col-span-2 text-sm text-muted`,children:[`Minimum minutes this season`,(0,S.jsx)(`input`,{type:`number`,min:0,step:90,className:`field mt-0.5 text-ink`,value:f,onChange:e=>p(e.target.value)})]})]}),(0,S.jsx)(`div`,{className:`mt-3 max-h-[26rem] overflow-y-auto pr-1`,"data-lenis-prevent":!0,children:(0,S.jsx)(_,{query:w,isEmpty:e=>e.items.length===0,empty:(0,S.jsx)(g,{title:`No players fit these filters`,children:(0,S.jsx)(`p`,{children:`Try fewer minutes or a wider age range`})}),children:e=>(0,S.jsx)(`ul`,{children:e.items.map(e=>(0,S.jsx)(`li`,{children:(0,S.jsxs)(`button`,{type:`button`,"aria-current":T===e.player_id,onClick:()=>y(e.player_id),className:`chalk flex min-h-11 w-full items-center gap-2 border-b px-1 py-2 text-left ${T===e.player_id?`bg-surface text-accent`:`hover:bg-surface/50`}`,children:[(0,S.jsx)(`span`,{className:`min-w-0 flex-1 truncate`,children:e.name}),(0,S.jsx)(`span`,{className:`text-sm text-muted`,children:e.tla})]})},e.player_id))})})})]}),(0,S.jsx)(`section`,{"aria-label":`Player profile`,className:`min-w-0`,children:T?(0,S.jsx)(K,{id:T},T):(0,S.jsx)(g,{title:`Pick a player to see their profile`})})]})]})}export{q as default};