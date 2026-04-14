precision mediump float;

uniform vec4 u_color;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;

varying vec2 v_texCoord;

void main() {
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_texCoord).r : 1.0;
  gl_FragColor = vec4(u_color.rgb, u_color.a * maskValue);
}
