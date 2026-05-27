/** Small helper for joining conditional class name fragments. */
export function cn(...classes: Array<false | null | string | undefined>) {
  return classes.filter(Boolean).join(" ");
}
