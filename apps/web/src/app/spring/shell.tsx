import { useState } from 'react';
import { Button, Tab, TabBody, Tabs } from 'react95';
import styled from 'styled-components';
import { Muted } from '../../components/win95';
import { useSession } from '../session';
import { DashboardView } from './dashboard-view';
import { GatewaysView } from './gateways-view';
import { PlanterView } from './planter-view';
import { PlantersView } from './planters-view';

export type TabId = 'dashboard' | 'planters' | 'gateways';

/** Where the user is inside the Spring window. */
export type Nav = {
  tab: TabId;
  /** Set while a planter's detail is open on the Planters tab. */
  planterId: string | null;
  /** Opens the pairing dialog as soon as the Gateways tab shows. */
  pair: boolean;
};

export type Navigate = (next: Partial<Nav>) => void;

const Top = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const Body = styled(TabBody)`
  max-height: calc(100vh - 220px);
  overflow: auto;
`;

export function SpringShell() {
  const { user, logout } = useSession();
  const [nav, setNav] = useState<Nav>({
    tab: 'dashboard',
    planterId: null,
    pair: false,
  });
  const go: Navigate = (next) =>
    setNav((current) => ({
      ...current,
      planterId: null,
      pair: false,
      ...next,
    }));

  return (
    <div>
      <Top>
        <Muted>
          Logged on as <b>{user?.email}</b>
        </Muted>
        <Button size="sm" onClick={() => void logout()}>
          Log out
        </Button>
      </Top>
      <Tabs value={nav.tab} onChange={(value: TabId) => go({ tab: value })}>
        <Tab value="dashboard">Dashboard</Tab>
        <Tab value="planters">Planters</Tab>
        <Tab value="gateways">Gateways</Tab>
      </Tabs>
      <Body>
        {nav.tab === 'dashboard' && <DashboardView go={go} />}
        {nav.tab === 'planters' &&
          (nav.planterId ? (
            <PlanterView
              key={nav.planterId}
              id={nav.planterId}
              onBack={() => go({ tab: 'planters' })}
            />
          ) : (
            <PlantersView go={go} />
          ))}
        {nav.tab === 'gateways' && <GatewaysView pairNow={nav.pair} go={go} />}
      </Body>
    </div>
  );
}
