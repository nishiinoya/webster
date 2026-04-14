precision mediump float;

uniform sampler2D u_texture;
uniform sampler2D u_mask;
uniform bool u_maskEnabled;
uniform float u_opacity;

varying vec2 v_texCoord;

void main() {
  vec4 color = texture2D(u_texture, v_texCoord);
  float maskValue = u_maskEnabled ? texture2D(u_mask, v_texCoord).r : 1.0;
  gl_FragColor = vec4(color.rgb, color.a * u_opacity * maskValue);
}
