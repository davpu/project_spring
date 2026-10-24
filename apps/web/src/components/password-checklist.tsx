import { PASSWORD_RULES } from '@org/shared';
import styled from 'styled-components';

const List = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
`;

const Rule = styled.li<{ $met: boolean }>`
  color: ${({ $met }) => ($met ? '#008000' : 'inherit')};

  &::before {
    content: '${({ $met }) => ($met ? '✔' : '•')}';
    display: inline-block;
    width: 1.2em;
  }
`;

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <List aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <Rule key={rule.id} $met={met}>
            {rule.label}
            <span className="visually-hidden">{met ? ' (met)' : ''}</span>
          </Rule>
        );
      })}
    </List>
  );
}
