import type { Object3DKind } from "../../layers/Layer";
import { ShaderProgram } from "../shaders/ShaderProgram";
import type { Object3DShaderProgram } from "../shaders/Object3DShaderProgram";

type Object3DDrawableProgram = ShaderProgram &
  Pick<Object3DShaderProgram, "normalAttributeLocation" | "texCoordAttributeLocation">;

type MeshArrays = {
  normals: Float32Array;
  texCoords: Float32Array;
  vertices: Float32Array;
};

export class Object3DMesh {
  private readonly normalBuffer: WebGLBuffer;
  private readonly texCoordBuffer: WebGLBuffer;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexCount: number;

  constructor(
    private readonly gl: WebGLRenderingContext,
    arrays: MeshArrays
  ) {
    const normalBuffer = gl.createBuffer();
    const texCoordBuffer = gl.createBuffer();
    const vertexBuffer = gl.createBuffer();

    if (!normalBuffer || !texCoordBuffer || !vertexBuffer) {
      throw new Error("Unable to create 3D mesh buffers.");
    }

    this.normalBuffer = normalBuffer;
    this.texCoordBuffer = texCoordBuffer;
    this.vertexBuffer = vertexBuffer;
    this.vertexCount = arrays.vertices.length / 3;

    this.uploadBuffer(this.vertexBuffer, arrays.vertices);
    this.uploadBuffer(this.normalBuffer, arrays.normals);
    this.uploadBuffer(this.texCoordBuffer, arrays.texCoords);
  }

  draw(program: Object3DDrawableProgram) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.enableVertexAttribArray(program.positionAttributeLocation);
    this.gl.vertexAttribPointer(
      program.positionAttributeLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
    this.gl.enableVertexAttribArray(program.normalAttributeLocation);
    this.gl.vertexAttribPointer(
      program.normalAttributeLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.enableVertexAttribArray(program.texCoordAttributeLocation);
    this.gl.vertexAttribPointer(
      program.texCoordAttributeLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);
  }

  dispose() {
    this.gl.deleteBuffer(this.normalBuffer);
    this.gl.deleteBuffer(this.texCoordBuffer);
    this.gl.deleteBuffer(this.vertexBuffer);
  }

  private uploadBuffer(buffer: WebGLBuffer, data: Float32Array) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
  }
}

export function createObject3DMesh(gl: WebGLRenderingContext, kind: Object3DKind) {
  return new Object3DMesh(gl, createObject3DMeshArrays(kind));
}

function createObject3DMeshArrays(kind: Object3DKind): MeshArrays {
  if (kind === "sphere") {
    return createSphereMeshArrays();
  }

  if (kind === "pyramid") {
    return createPyramidMeshArrays();
  }

  return createCubeMeshArrays();
}

function createCubeMeshArrays(): MeshArrays {
  const faces = [
    {
      normal: [0, 0, 1],
      points: [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1]
      ]
    },
    {
      normal: [0, 0, -1],
      points: [
        [1, -1, -1],
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1]
      ]
    },
    {
      normal: [1, 0, 0],
      points: [
        [1, -1, 1],
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1]
      ]
    },
    {
      normal: [-1, 0, 0],
      points: [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1]
      ]
    },
    {
      normal: [0, 1, 0],
      points: [
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
        [-1, 1, -1]
      ]
    },
    {
      normal: [0, -1, 0],
      points: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1]
      ]
    }
  ];
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];

  for (const face of faces) {
    pushFace(vertices, normals, texCoords, face.points, face.normal);
  }

  return toMeshArrays(vertices, normals, texCoords);
}

function createPyramidMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const apex = [0, 1.25, 0];
  const base = [
    [-1, -1, 1],
    [1, -1, 1],
    [1, -1, -1],
    [-1, -1, -1]
  ];

  pushFace(vertices, normals, texCoords, [base[0], base[1], base[2], base[3]], [0, -1, 0]);

  for (let index = 0; index < base.length; index += 1) {
    const nextIndex = (index + 1) % base.length;
    const triangle = [base[index], base[nextIndex], apex];
    const normal = getFaceNormal(triangle[0], triangle[1], triangle[2]);

    pushTriangle(vertices, normals, texCoords, triangle, normal, [
      [0, 0],
      [1, 0],
      [0.5, 1]
    ]);
  }

  return toMeshArrays(vertices, normals, texCoords);
}

function createSphereMeshArrays(): MeshArrays {
  const vertices: number[] = [];
  const normals: number[] = [];
  const texCoords: number[] = [];
  const rows = 16;
  const columns = 32;

  for (let row = 0; row < rows; row += 1) {
    const v0 = row / rows;
    const v1 = (row + 1) / rows;
    const theta0 = v0 * Math.PI;
    const theta1 = v1 * Math.PI;

    for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns;
      const u1 = (column + 1) / columns;
      const phi0 = u0 * Math.PI * 2;
      const phi1 = u1 * Math.PI * 2;
      const p00 = sphericalPoint(theta0, phi0);
      const p10 = sphericalPoint(theta0, phi1);
      const p01 = sphericalPoint(theta1, phi0);
      const p11 = sphericalPoint(theta1, phi1);

      pushTriangle(vertices, normals, texCoords, [p00, p01, p10], [p00, p01, p10], [
        [u0, 1 - v0],
        [u0, 1 - v1],
        [u1, 1 - v0]
      ]);
      pushTriangle(vertices, normals, texCoords, [p10, p01, p11], [p10, p01, p11], [
        [u1, 1 - v0],
        [u0, 1 - v1],
        [u1, 1 - v1]
      ]);
    }
  }

  return toMeshArrays(vertices, normals, texCoords);
}

function pushFace(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  points: number[][],
  normal: number[]
) {
  pushTriangle(vertices, normals, texCoords, [points[0], points[1], points[2]], normal, [
    [0, 0],
    [1, 0],
    [1, 1]
  ]);
  pushTriangle(vertices, normals, texCoords, [points[0], points[2], points[3]], normal, [
    [0, 0],
    [1, 1],
    [0, 1]
  ]);
}

function pushTriangle(
  vertices: number[],
  normals: number[],
  texCoords: number[],
  points: number[][],
  normalOrNormals: number[] | number[][],
  uvs: number[][]
) {
  for (let index = 0; index < 3; index += 1) {
    const point = points[index];
    const normal = Array.isArray(normalOrNormals[0])
      ? (normalOrNormals as number[][])[index]
      : (normalOrNormals as number[]);
    const uv = uvs[index];

    vertices.push(point[0], point[1], point[2]);
    normals.push(normal[0], normal[1], normal[2]);
    texCoords.push(uv[0], uv[1]);
  }
}

function sphericalPoint(theta: number, phi: number) {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi)
  ];
}

function getFaceNormal(a: number[], b: number[], c: number[]) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];

  return normalize([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
}

function normalize(vector: number[]) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function toMeshArrays(vertices: number[], normals: number[], texCoords: number[]): MeshArrays {
  return {
    normals: new Float32Array(normals),
    texCoords: new Float32Array(texCoords),
    vertices: new Float32Array(vertices)
  };
}
