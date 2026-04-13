attribute vec2 a_position;

uniform mat3 u_model;
uniform mat3 u_projection;

void main() {
  vec3 worldPosition = u_model * vec3(a_position, 1.0);
  vec3 clipPosition = u_projection * worldPosition;
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
