export function revisionLabel(revision: string): string {
  const value = revision.trim();
  if (/^[0-9a-f]{7,40}$/.test(value)) {
    return value.slice(0, 7);
  }
  return value.length > 0 ? value : "dev";
}

export function BuildStamp({
  revision = __PREF_REVISION__,
}: {
  revision?: string;
}): React.JSX.Element {
  const full = revision.trim().length > 0 ? revision.trim() : "dev";
  return (
    <p className="build-stamp" title={`версия ${full}`}>
      версия {revisionLabel(full)}
    </p>
  );
}
