attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec3 a_tangent;
attribute vec2 a_texCoord;
attribute vec4 a_color;

uniform mat3 u_layerModel;
uniform mat4 u_model3D;
uniform mat4 u_normalModel;
uniform vec2 u_objectScale;
uniform mat3 u_projection;
uniform mat4 u_viewProjection3D;

varying vec2 v_layerTexCoord;
varying vec4 v_color;
varying vec3 v_normal;
varying vec3 v_position3D;
varying vec3 v_tangent;
varying vec2 v_texCoord;
varying vec2 v_worldCoord;

void main() {
  vec4 world3D = u_model3D * vec4(a_position, 1.0);
  vec4 projected3D = u_viewProjection3D * world3D;
  vec2 objectNdc = projected3D.xy / projected3D.w;
  vec2 layerCoord = vec2(0.5 + objectNdc.x * u_objectScale.x, 0.52 + objectNdc.y * u_objectScale.y);
  vec3 world2D = u_layerModel * vec3(layerCoord, 1.0);
  vec3 clip2D = u_projection * world2D;

  v_layerTexCoord = layerCoord;
  v_color = a_color;
  v_normal = normalize((u_normalModel * vec4(a_normal, 0.0)).xyz);
  v_position3D = world3D.xyz;
  v_tangent = normalize((u_normalModel * vec4(a_tangent, 0.0)).xyz);
  v_texCoord = a_texCoord;
  v_worldCoord = world2D.xy;
  gl_Position = vec4(clip2D.xy, projected3D.z / projected3D.w, 1.0);
}
