import type { ReactNode } from 'react';
import { Computer } from '@react95/icons/Computer';
import { FolderExe } from '@react95/icons/FolderExe';
import { RecycleEmpty } from '@react95/icons/RecycleEmpty';
import { SpringApp } from '../spring/spring-app';

export type WindowId = 'computer' | 'app' | 'recycle';

export type WindowSpec = {
  id: WindowId;
  title: string;
  icon: ReactNode;
  smallIcon: ReactNode;
  content: ReactNode;
  /** Window width in px; defaults to 420. */
  width?: number;
};

export const WINDOWS: WindowSpec[] = [
  {
    id: 'computer',
    title: 'My Computer',
    icon: <Computer variant="32x32_4" />,
    smallIcon: <Computer variant="16x16_4" />,
    content: (
      <ul>
        <li>3½ Floppy (A:)</li>
        <li>Spring (C:)</li>
        <li>Control Panel</li>
        <li>Printers</li>
      </ul>
    ),
  },
  {
    id: 'app',
    title: 'Spring',
    icon: <FolderExe variant="32x32_4" />,
    smallIcon: <FolderExe variant="16x16_4" />,
    content: <SpringApp />,
    width: 640,
  },
  {
    id: 'recycle',
    title: 'Recycle Bin',
    icon: <RecycleEmpty variant="32x32_4" />,
    smallIcon: <RecycleEmpty variant="16x16_4" />,
    content: <p>The Recycle Bin is empty.</p>,
  },
];
