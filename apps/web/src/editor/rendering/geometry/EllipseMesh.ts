import { ShaderProgram } from "../shaders/ShaderProgram";

export class EllipseMesh {
    private readonly fillBuffer: WebGLBuffer;
    private readonly strokeBuffer: WebGLBuffer;
    private readonly fillVertexCount: number;
    private readonly strokeVertexCount: number;

    constructor(
        private readonly gl: WebGLRenderingContext,
        segments = 72
    ){
        const fillVertices: number[] = [0.5, 0.5];
        const strokeVertices: number[] = [];

        for (let index = 0; index <= segments; index += 1){
            const angle = (index / segments) * ( Math.PI * 2);
            const x = 0.5 + Math.cos(angle) * 0.5;
            const y = 0.5 + Math.sin(angle) * 0.5;

            fillVertices.push(x, y);
        }

        for (let index = 0; index <= segments; index += 1) {
            const angle = (index / segments) * Math.PI * 2;
            const outerX = 0.5 + Math.cos(angle) * 0.5;
            const outerY = 0.5 + Math.sin(angle) * 0.5;
            const innerX = 0.5 + Math.cos(angle) * 0.42;
            const innerY = 0.5 + Math.sin(angle) * 0.42;

            strokeVertices.push(outerX, outerY, innerX, innerY);
        }

        const fillBuffer = gl.createBuffer();
        const strokeBuffer = gl.createBuffer();

        if (!fillBuffer || !strokeBuffer) {
            throw new Error("Unable to create ellipse geometry buffers.");
        }

        this.fillBuffer = fillBuffer;
        this.strokeBuffer = strokeBuffer;
        this.fillVertexCount = fillVertices.length / 2;
        this.strokeVertexCount = strokeVertices.length / 2;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.fillBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fillVertices), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(strokeVertices), gl.STATIC_DRAW);
    }

    drawFill(program: ShaderProgram) {
        this.bindPositionBuffer(program, this.fillBuffer);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, this.fillVertexCount);
    }

    drawStroke(program: ShaderProgram) {
        this.bindPositionBuffer(program, this.strokeBuffer);
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.strokeVertexCount);
    }

    dispose() {
        this.gl.deleteBuffer(this.fillBuffer);
        this.gl.deleteBuffer(this.strokeBuffer);
    }

    private bindPositionBuffer(program: ShaderProgram, buffer: WebGLBuffer) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.enableVertexAttribArray(program.positionAttributeLocation);
        this.gl.vertexAttribPointer(
        program.positionAttributeLocation,
        2,
        this.gl.FLOAT,
        false,
        0,
        0
        );
    }
}
