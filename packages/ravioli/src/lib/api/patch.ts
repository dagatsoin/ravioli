/**
 * One operation of a JSON patch (RFC 6902). Of the six operations of the
 * standard, only add, remove and replace are ever written.
 */
export type PatchOperation = {
  op: "add" | "remove" | "replace";
  /**
   * Where, as a JSON pointer (RFC 6901) from the root of the model data.
   */
  path: string;
  /**
   * What is put there. None for a remove. It is a JSON copy of what the model
   * held right after the write: nothing which happens to the model later
   * rewrites it.
   */
  value?: any;
};

/**
 * One write in the model: the operations which describe it, in the order to
 * apply them. Whatever a write does to an array, a splice for example, it is
 * one patch.
 */
export type Patch = PatchOperation[];
