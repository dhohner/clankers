from __future__ import annotations

import re
from pathlib import Path

from .model import JavaFileContext, SymbolMetric

COMMENT_RE = re.compile(r"/\*.*?\*/|//.*?$", re.MULTILINE | re.DOTALL)
STRING_RE = re.compile(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"")
JAVA_BRANCH_RE = re.compile(r"\b(if|else\s+if|for|while|case|catch|switch|default)\b|&&|\|\||\?")
JAVA_METHOD_RE = re.compile(
    r"(?P<prefix>(?:@[\w.]+(?:\([^)]*\))?\s*)*(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)*)"
    r"(?P<ret>[A-Za-z_$][\w$<>\[\], ?]*(?:\s+|\s*<[^;{}()]*>\s+))?"
    r"(?P<name>[A-Za-z_$][\w$]*)\s*\((?P<params>[^)]*)\)\s*(?P<end>[{;])",
    re.MULTILINE,
)
JAVA_FIELD_RE = re.compile(r"\b(?:private|protected|public)?\s*(?:final\s+)?(?P<type>[A-Z][\w$<>]*)\s+(?P<name>[a-zA-Z_$][\w$]*)\s*(?:[=;])")
JAVA_LOCAL_RE = re.compile(r"\b(?P<type>[A-Z][\w$]*(?:\s*<[^;=(){}]+>)?)\s+(?P<name>[a-zA-Z_$][\w$]*)\s*(?:=|;|,|\))")
JAVA_CALL_RE = re.compile(r"\b(?P<recv>[A-Za-z_$][\w$]*)\s*\.\s*(?P<method>[A-Za-z_$][\w$]*)\s*\(|(?<!\.)\b(?P<direct>[A-Za-z_$][\w$]*)\s*\(")
JAVA_CONTROL_WORDS = {"if", "for", "while", "switch", "catch", "return", "throw", "new", "super", "this", "try", "synchronized"}
JAVA_LANG_TYPES = {"String", "Object", "Class", "System", "Math", "Integer", "Long", "Boolean", "Double", "Float", "Short", "Byte", "Character"}
JAVA_REPOSITORY_RE = re.compile(r"@(Repository)\b|\bextends\s+(?:JpaRepository|CrudRepository|PagingAndSortingRepository|MongoRepository)\b")
JAVA_BOUNDARY_PATTERNS = (
    ("jdbc", re.compile(r"\b(JdbcTemplate|PreparedStatement|Statement|Connection|executeQuery|executeUpdate|queryFor)\b", re.IGNORECASE)),
    ("entity-manager", re.compile(r"\b(EntityManager|createQuery|createNativeQuery)\b", re.IGNORECASE)),
    ("raw-sql", re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE)\b", re.IGNORECASE)),
    ("http-client", re.compile(r"\b(RestTemplate|WebClient|HttpClient|OkHttpClient|FeignClient)\b", re.IGNORECASE)),
    ("kafka", re.compile(r"\b(KafkaTemplate|KafkaProducer|KafkaConsumer)\b", re.IGNORECASE)),
    ("queue", re.compile(r"\b(RabbitTemplate|JmsTemplate|SqsClient)\b", re.IGNORECASE)),
    ("redis", re.compile(r"\b(RedisTemplate|ReactiveRedisTemplate|StringRedisTemplate)\b", re.IGNORECASE)),
    ("cache", re.compile(r"\b(CacheManager|Caffeine|Hazelcast)\b", re.IGNORECASE)),
    ("s3", re.compile(r"\b(S3Client|S3AsyncClient|AmazonS3)\b", re.IGNORECASE)),
    ("object-store", re.compile(r"\b(BlobServiceClient)\b", re.IGNORECASE)),
)


def clean_code(text: str) -> str:
    return COMMENT_RE.sub(" ", STRING_RE.sub(" ", text))


def simple_java_type(value: str) -> str:
    value = re.sub(r"<.*>|\[\]", "", value).split(".")[-1].strip()
    return value.split()[-1] if value.split() else value


def java_package(text: str) -> str:
    match = re.search(r"^\s*package\s+([\w.]+)\s*;", text, re.MULTILINE)
    return match.group(1) if match else ""


def java_file_context(text: str, path: Path, root: Path) -> JavaFileContext:
    imports: dict[str, str] = {}
    wildcard_imports: list[str] = []
    for match in re.finditer(r"^\s*import\s+(?:static\s+)?([\w.]+)(\.\*)?\s*;", text, re.MULTILINE):
        name = match.group(1)
        if match.group(2):
            wildcard_imports.append(name)
        else:
            imports[name.split(".")[-1]] = name
    return JavaFileContext(path.relative_to(root), java_package(text), imports, wildcard_imports)


def resolve_type_name(type_name: str, ctx: JavaFileContext) -> str:
    simple = simple_java_type(type_name)
    if not simple:
        return ""
    if "." in type_name and type_name[0].islower():
        return type_name
    if simple in ctx.imports:
        return ctx.imports[simple]
    if simple in JAVA_LANG_TYPES:
        return f"java.lang.{simple}"
    if ctx.package:
        return f"{ctx.package}.{simple}"
    return simple


def annotation_names(text: str) -> list[str]:
    return [a.split(".")[-1] for a in re.findall(r"@([A-Za-z_$][\w$.]*)", text)]


def java_class_info(text: str, path: Path) -> tuple[str, str, list[str], list[str]]:
    match = re.search(
        r"(?P<ann>(?:\s*@[\w.]+(?:\([^)]*\))?\s*)*)\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(?P<kind>class|interface|enum|record)\s+(?P<name>[A-Za-z_$][\w$]*)(?P<tail>[^{};]*)",
        text,
        re.MULTILINE,
    )
    if not match:
        return path.stem, "class", [], []
    tail = match.group("tail") or ""
    implements: list[str] = []
    impl = re.search(r"\bimplements\s+([^\{]+)", tail)
    if impl:
        implements.extend(simple_java_type(p.strip()) for p in impl.group(1).split(",") if p.strip())
    ext = re.search(r"\bextends\s+([^\{]+)", tail)
    if ext and match.group("kind") == "interface":
        implements.extend(simple_java_type(p.strip()) for p in ext.group(1).split(",") if p.strip())
    return match.group("name"), match.group("kind"), annotation_names(match.group("ann") or ""), implements


def visibility_from_prefix(prefix: str) -> str:
    for vis in ("public", "protected", "private"):
        if re.search(rf"\b{vis}\b", prefix):
            return vis
    return "package"


def java_field_types(text: str) -> dict[str, str]:
    return {m.group("name"): simple_java_type(m.group("type")) for m in JAVA_FIELD_RE.finditer(clean_code(text))}


def java_params(params: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in params.split(","):
        bits = [b for b in re.sub(r"@[\w.]+(?:\([^)]*\))?", "", part).strip().split() if b != "final"]
        if len(bits) >= 2:
            out[bits[-1].replace("...", "")] = simple_java_type(bits[-2])
    return out


def line_for_offset(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def find_matching_brace(text: str, open_offset: int) -> int:
    depth = 0
    masked = STRING_RE.sub(lambda m: " " * (m.end() - m.start()), COMMENT_RE.sub(lambda m: " " * (m.end() - m.start()), text))
    for i in range(open_offset, len(masked)):
        if masked[i] == "{":
            depth += 1
        elif masked[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(text)


def java_boundary_for(class_text: str, body: str) -> str | None:
    if JAVA_REPOSITORY_RE.search(class_text):
        return "jpa-repository"
    for name, pattern in JAVA_BOUNDARY_PATTERNS:
        if pattern.search(body) or pattern.search(class_text):
            return name
    return None


def extract_java_symbols(path: Path, root: Path, changed_lines: set[int] | None) -> list[SymbolMetric]:
    text = path.read_text(errors="ignore")
    rel = path.relative_to(root)
    ctx = java_file_context(text, path, root)
    cls, class_kind, class_annotations, implements = java_class_info(text, path)
    fqcn = f"{ctx.package}.{cls}" if ctx.package else cls
    implements = [resolve_type_name(i, ctx) for i in implements]
    fields = java_field_types(text)
    symbols: list[SymbolMetric] = []
    occupied: list[tuple[int, int]] = []
    for match in JAVA_METHOD_RE.finditer(text):
        name = match.group("name")
        prelude = text[max(0, match.start() - 24):match.start()]
        if name in JAVA_CONTROL_WORDS or (match.group("ret") or "").strip() in {"record", "class", "interface", "enum"} or re.search(r"\b(record|class|interface|enum)\s+$", prelude):
            continue
        start = line_for_offset(text, match.start())
        if match.group("end") == "{":
            open_offset = text.find("{", match.end() - 1)
            close_offset = find_matching_brace(text, open_offset)
            end = line_for_offset(text, close_offset)
            body = text[open_offset + 1:close_offset]
        else:
            end = start
            body = ""
        if any(a <= start <= b for a, b in occupied):
            continue
        occupied.append((start, end))
        vars_to_types = dict(fields)
        vars_to_types.update(java_params(match.group("params") or ""))
        vars_to_types.update({m.group("name"): simple_java_type(m.group("type")) for m in JAVA_LOCAL_RE.finditer(clean_code(body))})
        calls: set[str] = set()
        call_targets: dict[str, str] = {}
        for call in JAVA_CALL_RE.finditer(clean_code(body)):
            direct = call.group("direct")
            if direct:
                if direct not in JAVA_CONTROL_WORDS and direct != name and not direct[:1].isupper():
                    calls.add(f"{cls}.{direct}")
                continue
            recv = call.group("recv")
            method = call.group("method")
            resolved_call = None
            resolved_fqcn = None
            if recv in {"this", "super"}:
                resolved_call = f"{cls}.{method}"
                resolved_fqcn = fqcn
            elif recv in vars_to_types:
                recv_type = simple_java_type(vars_to_types[recv])
                resolved_call = f"{recv_type}.{method}"
                resolved_fqcn = resolve_type_name(vars_to_types[recv], ctx)
            elif recv and recv[:1].isupper():
                recv_type = simple_java_type(recv)
                resolved_call = f"{recv_type}.{method}"
                resolved_fqcn = resolve_type_name(recv, ctx)
            if resolved_call:
                calls.add(resolved_call)
                if resolved_fqcn:
                    call_targets[resolved_call] = resolved_fqcn
        changed = bool(changed_lines and any(start <= line <= end for line in changed_lines))
        method_annotations = annotation_names(match.group("prefix") or "")
        symbols.append(SymbolMetric(
            id=f"{rel.as_posix()}::{cls}.{name}", path=rel, class_name=cls, name=name, kind="method",
            start_line=start, end_line=end, complexity=1 + len(JAVA_BRANCH_RE.findall(clean_code(body))),
            calls=calls, changed=changed, boundary=java_boundary_for(text, body), package=ctx.package,
            annotations=sorted(set(class_annotations + method_annotations)), class_annotations=class_annotations,
            method_annotations=method_annotations, class_kind=class_kind, visibility=visibility_from_prefix(match.group("prefix") or ""),
            implements=implements, fqcn=fqcn, imports=ctx.imports, wildcard_imports=ctx.wildcard_imports, call_targets=call_targets,
        ))
    return symbols
