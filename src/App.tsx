/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Chat from './components/Chat';
import Workspace from './components/Workspace';

export default function App() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-gray-900 font-sans">
      <div className="w-[350px] shrink-0 h-full border-r border-gray-200 shadow-sm z-10">
        <Chat />
      </div>
      <div className="flex-1 h-full min-w-0">
        <Workspace />
      </div>
    </div>
  );
}
