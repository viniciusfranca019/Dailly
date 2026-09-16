import { mountShell } from './mount.js'
import { MODULES } from './modules.js'
import './styles.css'

const host = document.querySelector<HTMLElement>('#app')!

void mountShell(host, { modules: MODULES })
