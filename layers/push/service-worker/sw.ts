/// <reference lib="webworker" />
import { setupCore } from '../../pwa/service-worker/core'
import { setupPush } from './push'

declare const self: ServiceWorkerGlobalScope

setupCore(self, self.__WB_MANIFEST)
setupPush(self)
