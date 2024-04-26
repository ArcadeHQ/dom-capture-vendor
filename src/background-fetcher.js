;(function () {
  'use strict'

  /*
   * Copyright 2010-2020 Gildas Lormeau
   * contact : gildas.lormeau <at> gmail.com
   *
   * This file is part of SingleFile.
   *
   *   The code in this file is free software: you can redistribute it and/or
   *   modify it under the terms of the GNU Affero General Public License
   *   (GNU AGPL) as published by the Free Software Foundation, either version 3
   *   of the License, or (at your option) any later version.
   *
   *   The code in this file is distributed in the hope that it will be useful,
   *   but WITHOUT ANY WARRANTY; without even the implied warranty of
   *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
   *   General Public License for more details.
   *
   *   As additional permission under GNU AGPL version 3 section 7, you may
   *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
   *   AGPL normally required by section 4, provided you include this license
   *   notice and a URL through which recipients can access the Corresponding
   *   Source.
   */

  const MAX_CONTENT_SIZE = 8 * (1024 * 1024)
  const REQUEST_WAIT_DELAY = 1000

  let requestId = 0

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.method && message.method.startsWith('singlefile.fetch')) {
      new Promise(resolve => {
        onRequest(message, sender)
          .then(resolve)
          .catch(error => resolve({ error: error && error.toString() }))
      })
      // Added myself
      sendResponse({ success: true })
    }
  })

  async function onRequest(message, sender) {
    if (message.method == 'singlefile.fetch') {
      console.log('fetcher.js onRequest() message:', message)

      try {
        const response = await fetchResource(message.url, {
          referrer: message.referrer,
          headers: message.headers,
        })
        console.log('singlefile.fetch', response)
        return sendResponse(sender.tab.id, message.requestId, response)
      } catch (error) {
        return sendResponse(sender.tab.id, message.requestId, {
          error: error.message,
          array: [],
        })
      }
    } else if (message.method == 'singlefile.fetchFrame') {
      return chrome.tabs.sendMessage(sender.tab.id, message)
    }
  }

  async function sendResponse(tabId, requestId, response) {
    for (
      let blockIndex = 0;
      blockIndex * MAX_CONTENT_SIZE <= response.array.length;
      blockIndex++
    ) {
      const message = {
        method: 'singlefile.fetchResponse',
        requestId,
        headers: response.headers,
        status: response.status,
        error: response.error,
      }
      message.truncated = response.array.length > MAX_CONTENT_SIZE
      if (message.truncated) {
        message.finished =
          (blockIndex + 1) * MAX_CONTENT_SIZE > response.array.length
        message.array = response.array.slice(
          blockIndex * MAX_CONTENT_SIZE,
          (blockIndex + 1) * MAX_CONTENT_SIZE
        )
      } else {
        message.array = response.array
      }
      await chrome.tabs.sendMessage(tabId, message)
    }
    return {}
  }

  async function fetchResource(url, options = {}) {
    const response = await fetch(url, options)
    if (
      (options.referrer && response.status == 401) ||
      response.status == 403 ||
      response.status == 404
    ) {
      const requestId = await enableReferrerOnError(url, options.referrer)
      await new Promise(resolve => setTimeout(resolve, REQUEST_WAIT_DELAY))
      try {
        const response = await fetch(url, options)
        const array = Array.from(new Uint8Array(await response.arrayBuffer()))
        const headers = { 'content-type': response.headers.get('content-type') }
        const status = response.status
        return {
          array,
          headers,
          status,
        }
      } finally {
        await disableReferrerOnError(requestId)
      }
    }

    const array = Array.from(new Uint8Array(await response.arrayBuffer()))
    const headers = { 'content-type': response.headers.get('content-type') }
    const status = response.status
    return {
      array,
      headers,
      status,
    }
  }

  async function enableReferrerOnError(url, referrer) {
    const id = requestId++
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'Referer',
                operation: 'set',
                value: referrer,
              },
            ],
          },
          condition: {
            domains: [chrome.runtime.id],
            urlFilter: url,
            resourceTypes: ['xmlhttprequest'],
          },
          id,
        },
      ],
    })
    return id
  }

  async function disableReferrerOnError(requestId) {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [requestId],
    })
  }

  /*
   * Copyright 2010-2020 Gildas Lormeau
   * contact : gildas.lormeau <at> gmail.com
   *
   * This file is part of SingleFile.
   *
   *   The code in this file is free software: you can redistribute it and/or
   *   modify it under the terms of the GNU Affero General Public License
   *   (GNU AGPL) as published by the Free Software Foundation, either version 3
   *   of the License, or (at your option) any later version.
   *
   *   The code in this file is distributed in the hope that it will be useful,
   *   but WITHOUT ANY WARRANTY; without even the implied warranty of
   *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
   *   General Public License for more details.
   *
   *   As additional permission under GNU AGPL version 3 section 7, you may
   *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
   *   AGPL normally required by section 4, provided you include this license
   *   notice and a URL through which recipients can access the Corresponding
   *   Source.
   */

  /* global browser */

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      message.method == 'singlefile.frameTree.initResponse' ||
      message.method == 'singlefile.frameTree.ackInitRequest'
    ) {
      chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 })
      return Promise.resolve({})
    }
  })

  /*
   * Copyright 2010-2020 Gildas Lormeau
   * contact : gildas.lormeau <at> gmail.com
   *
   * This file is part of SingleFile.
   *
   *   The code in this file is free software: you can redistribute it and/or
   *   modify it under the terms of the GNU Affero General Public License
   *   (GNU AGPL) as published by the Free Software Foundation, either version 3
   *   of the License, or (at your option) any later version.
   *
   *   The code in this file is distributed in the hope that it will be useful,
   *   but WITHOUT ANY WARRANTY; without even the implied warranty of
   *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
   *   General Public License for more details.
   *
   *   As additional permission under GNU AGPL version 3 section 7, you may
   *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU
   *   AGPL normally required by section 4, provided you include this license
   *   notice and a URL through which recipients can access the Corresponding
   *   Source.
   */

  /* global browser, setTimeout, clearTimeout */

  const timeouts = new Map()

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.method == 'singlefile.lazyTimeout.setTimeout') {
      let tabTimeouts = timeouts.get(sender.tab.id)
      let frameTimeouts
      if (tabTimeouts) {
        frameTimeouts = tabTimeouts.get(sender.frameId)
        if (frameTimeouts) {
          const previousTimeoutId = frameTimeouts.get(message.type)
          if (previousTimeoutId) {
            clearTimeout(previousTimeoutId)
          }
        } else {
          frameTimeouts = new Map()
        }
      }
      const timeoutId = setTimeout(async () => {
        try {
          const tabTimeouts = timeouts.get(sender.tab.id)
          const frameTimeouts = tabTimeouts.get(sender.frameId)
          if (tabTimeouts && frameTimeouts) {
            deleteTimeout(frameTimeouts, message.type)
          }
          await chrome.tabs.sendMessage(sender.tab.id, {
            method: 'singlefile.lazyTimeout.onTimeout',
            type: message.type,
          })
        } catch (error) {
          // ignored
        }
      }, message.delay)
      if (!tabTimeouts) {
        tabTimeouts = new Map()
        frameTimeouts = new Map()
        tabTimeouts.set(sender.frameId, frameTimeouts)
        timeouts.set(sender.tab.id, tabTimeouts)
      }
      frameTimeouts.set(message.type, timeoutId)
      return Promise.resolve({})
    }
    if (message.method == 'singlefile.lazyTimeout.clearTimeout') {
      let tabTimeouts = timeouts.get(sender.tab.id)
      if (tabTimeouts) {
        const frameTimeouts = tabTimeouts.get(sender.frameId)
        if (frameTimeouts) {
          const timeoutId = frameTimeouts.get(message.type)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          deleteTimeout(frameTimeouts, message.type)
        }
      }
      return Promise.resolve({})
    }
  })

  chrome.tabs.onRemoved.addListener(tabId => timeouts.delete(tabId))

  function deleteTimeout(framesTimeouts, type) {
    framesTimeouts.delete(type)
  }
})()
