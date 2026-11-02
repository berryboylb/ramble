/**
 * Solves A × x = b by Gaussian elimination with partial pivoting.
 * `a` is an n × n row-major matrix. Both arrays are overwritten. The solution is left in `b`.
 * Returns false when the matrix is singular.
 */
export function solveLinear(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let pivotRow = k;
    let pivotSize = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const size = Math.abs(a[i * n + k]);
      if (size > pivotSize) {
        pivotSize = size;
        pivotRow = i;
      }
    }
    if (pivotSize < 1e-300) return false;

    if (pivotRow !== k) {
      for (let j = k; j < n; j++) {
        const t = a[k * n + j];
        a[k * n + j] = a[pivotRow * n + j];
        a[pivotRow * n + j] = t;
      }
      const t = b[k];
      b[k] = b[pivotRow];
      b[pivotRow] = t;
    }

    const pivot = a[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const factor = a[i * n + k] / pivot;
      if (factor === 0) continue;
      for (let j = k + 1; j < n; j++) a[i * n + j] -= factor * a[k * n + j];
      b[i] -= factor * b[k];
    }
  }

  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) sum -= a[i * n + j] * b[j];
    b[i] = sum / a[i * n + i];
  }
  return true;
}
