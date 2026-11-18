// Roda `npm audit` e falha com vulnerabilidade alta ou crítica, exceto as listadas
// em auditoria-excecoes.json (cada uma com motivo). Exceção que não aparece mais
// na auditoria também falha, para ser removida da lista.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const excecoes = JSON.parse(readFileSync(new URL('../auditoria-excecoes.json', import.meta.url)))
let saida
try {
  saida = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
} catch (erro) {
  saida = erro.stdout
}
const relatorio = JSON.parse(saida)
const graves = new Set(['high', 'critical'])
const achados = new Map()
for (const vuln of Object.values(relatorio.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object') continue
    const id = (via.url ?? '').split('/').pop()
    achados.set(id, via)
  }
}

let falhou = false
for (const [id, via] of achados) {
  if (!graves.has(via.severity)) continue
  if (excecoes[id]) {
    console.log(`Exceção aceita: ${id} (${via.name}) — ${excecoes[id].motivo}`)
  } else {
    console.error(`Vulnerabilidade ${via.severity}: ${id} em ${via.name} — ${via.title}`)
    falhou = true
  }
}
for (const id of Object.keys(excecoes)) {
  if (!achados.has(id)) {
    console.error(`Exceção ${id} não aparece mais na auditoria: remova-a de auditoria-excecoes.json.`)
    falhou = true
  }
}
if (falhou) process.exit(1)
console.log('Auditoria sem vulnerabilidade alta ou crítica fora das exceções.')
