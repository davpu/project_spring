import type { ReactNode } from 'react';
import styled from 'styled-components';

const IconButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 76px;
  padding: 4px 2px;
  border: none;
  background: none;
  color: #fff;

  &:focus {
    outline: none;
  }
`;

const Label = styled.span<{ $selected: boolean }>`
  padding: 0 2px;
  text-align: center;
  line-height: 1.2;
  background: ${({ $selected, theme }) =>
    $selected ? theme.hoverBackground : 'transparent'};
  outline: ${({ $selected }) => ($selected ? '1px dotted #ff0' : 'none')};
`;

type DesktopIconProps = {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
};

export function DesktopIcon({
  icon,
  label,
  selected,
  onSelect,
  onOpen,
}: DesktopIconProps) {
  return (
    <IconButton
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      {icon}
      <Label $selected={selected}>{label}</Label>
    </IconButton>
  );
}
