let failures = 0;

export function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

export function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

export function finish(): never {
  console.log(
    `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
