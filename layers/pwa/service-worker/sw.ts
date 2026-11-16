/// <reference lib="webworker" />
import { setupCore } from './core'

declare const self: ServiceWorkerGlobalScope

setupCore(self, self.__WB_MANIFEST)
