attribute vec2 a_position;

uniform mat3 u_projection;

varying vec2 v_worldPosition;

void main() {
  v_worldPosition = a_position;
  vec3 clipPosition = u_projection * vec3(a_position, 1.0);
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
