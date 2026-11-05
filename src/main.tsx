import React from 'react';
import ReactDOM from 'react-dom/client';
import { Theme } from '@radix-ui/themes';
import App from './App';
import '@radix-ui/themes/styles.css';
import '@daypicker/react/style.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme accentColor="indigo" grayColor="slate" radius="large" appearance="light" panelBackground="solid">
      <App />
    </Theme>
  </React.StrictMode>,
);
