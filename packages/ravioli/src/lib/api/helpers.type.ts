// Helper to transform a string to a literal.
export type ToLiteral<S extends string, R = { [key in S]: never }> = keyof R;

/**
 * Transform a set to an union type.
 * @deprecated Nothing uses it, and it has no replacement. It is removed in
 * the next major version.
 */
export type ToUnion<T> = T[keyof T];

// Infer array type
export type ArrayType<T> = T extends (infer Item)[] ? Item : T;
