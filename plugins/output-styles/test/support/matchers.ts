import { expect } from "vitest";

type EqualityCheck = (left: unknown, right: unknown) => boolean;

/** Pairs each expected item with one received item, including overlapping asymmetric matchers. */
function pairsExactly(received: readonly unknown[], expected: readonly unknown[], equals: EqualityCheck): boolean {
  if (received.length !== expected.length) return false;

  const expectedIndexByReceivedIndex = Array.from({ length: received.length }, () => -1);

  function pair(expectedIndex: number, visitedReceivedIndexes: Set<number>): boolean {
    for (let receivedIndex = 0; receivedIndex < received.length; receivedIndex += 1) {
      if (visitedReceivedIndexes.has(receivedIndex)) continue;
      if (!equals(received[receivedIndex], expected[expectedIndex])) continue;

      visitedReceivedIndexes.add(receivedIndex);
      const previousExpectedIndex = expectedIndexByReceivedIndex[receivedIndex];
      if (previousExpectedIndex === -1 || pair(previousExpectedIndex, visitedReceivedIndexes)) {
        expectedIndexByReceivedIndex[receivedIndex] = expectedIndex;
        return true;
      }
    }
    return false;
  }

  return expected.every((_, expectedIndex) => pair(expectedIndex, new Set()));
}

expect.extend({
  /**
   * Passes when the array holds exactly the expected items, in any order. Use it wherever the
   * production code makes no ordering promise, so a changed order is not a test failure. Assert
   * with toEqual where the order itself is the contract under test.
   */
  toEqualUnordered(received: unknown, expected: readonly unknown[]) {
    if (!Array.isArray(received)) {
      return {
        pass: false,
        message: () => `expected an array, received ${this.utils.printReceived(received)}`,
        actual: received,
        expected,
      };
    }

    return {
      pass: pairsExactly(received, expected, (left, right) => this.equals(left, right)),
      message: () =>
        `expected ${this.utils.printReceived(received)} to${this.isNot ? " not" : ""} hold exactly the items of ` +
        `${this.utils.printExpected(expected)}, in any order`,
      actual: received,
      expected,
    };
  },
});

declare module "vitest" {
  // The type parameter repeats Vitest's own default, which TypeScript requires for the merge.
  interface Matchers<T = any> {
    toEqualUnordered(expected: readonly unknown[]): T;
  }
}
