precision mediump float;

uniform vec4 u_colorA;
uniform vec4 u_colorB;
uniform float u_checkerSize;

varying vec2 v_worldPosition;

void main() {
  vec2 checker = floor(v_worldPosition / u_checkerSize);
  float checkerIndex = mod(checker.x + checker.y, 2.0);
  gl_FragColor = mix(u_colorA, u_colorB, checkerIndex);
}
