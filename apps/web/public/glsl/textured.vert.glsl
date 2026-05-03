attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec2 a_maskCoord;

uniform mat3 u_model;
uniform mat3 u_projection;

varying vec2 v_texCoord;
varying vec2 v_maskCoord;
varying vec2 v_worldCoord;

void main() {
  v_texCoord = a_texCoord;
  v_maskCoord = a_maskCoord;
  vec3 worldPosition = u_model * vec3(a_position, 1.0);
  v_worldCoord = worldPosition.xy;
  vec3 clipPosition = u_projection * worldPosition;
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
