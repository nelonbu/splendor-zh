interface ConnectionBannerProps {
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  opponentConnected: boolean;
}

export default function ConnectionBanner({ connectionStatus, opponentConnected }: ConnectionBannerProps) {
  let message = '';
  let variant = '';

  if (connectionStatus === 'reconnecting') {
    message = 'Reconnecting...';
    variant = 'warning';
  } else if (connectionStatus === 'disconnected') {
    message = 'Disconnected. Check your connection.';
    variant = 'error';
  } else if (connectionStatus === 'connecting') {
    message = 'Connecting...';
    variant = 'warning';
  } else if (!opponentConnected) {
    message = 'Opponent disconnected \u2014 waiting for them to return...';
    variant = 'orange';
  }

  return (
    <div className={`connection-banner ${variant} ${message ? 'visible' : ''}`}>
      {message}
    </div>
  );
}
