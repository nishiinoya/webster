attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_model;
uniform mat3 u_projection;

varying vec2 v_maskCoord;
varying vec2 v_strokeCoord;
varying vec2 v_worldCoord;

void main() {
  vec3 worldPosition = u_model * vec3(a_position, 1.0);

  v_maskCoord = a_position;
  v_strokeCoord = a_texCoord;
  v_worldCoord = worldPosition.xy;

  vec3 clipPosition = u_projection * worldPosition;
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}