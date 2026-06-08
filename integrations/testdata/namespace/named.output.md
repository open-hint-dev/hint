<system_context type="NAMESPACE" name="billing">

All code in this scope belongs to the `billing` namespace — emit it under the target language's namespacing construct (package, namespace, or module path) with this as the qualified name and import root. Everything here handles invoicing and payment capture. Code here may reference payments; nothing under it may be imported by the catalog namespace. Keep cross-namespace references explicit and do not leak symbols across this boundary.

</system_context>
