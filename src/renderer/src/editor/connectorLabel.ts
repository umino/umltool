// コネクタ（結合子）の既定ラベルの決め方。X6 に依存しない純粋関数（テスト用に分離）。

/**
 * 新しいコネクタに付ける既定ラベル。コネクタは「出口」と「入口」の 2 つで
 * 1 組なので、相方のいないラベル（1 回だけ使われている A, B, C…）があれば
 * それを返して組を完成させる。無ければまだ使っていない次の文字を返す。
 */
export function nextConnectorLabel(labels: string[]): string {
  const count = new Map<string, number>()
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1)
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))
  const unpaired = letters.find((c) => count.get(c) === 1)
  if (unpaired) return unpaired
  return letters.find((c) => !count.has(c)) ?? 'A'
}
