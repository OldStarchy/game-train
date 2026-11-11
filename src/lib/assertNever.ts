/**
 * Exhaustiveness check for discriminated unions:
 * `default: return assertNever(value);`
 */
export function assertNever(value: never): never {
	throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
