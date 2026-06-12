import { Button, Card, CardContent, CardHeader, CardTitle } from '@openzeppelin/ui-components';
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount';
import { useUserOpPipeline } from '../hooks/useUserOpPipeline';

export function UserOpPipelinePanel() {
  const passkey = usePasskeyAccount();
  const pipeline = useUserOpPipeline({
    sender: passkey.address,
    coords: passkey.coords,
    signUserOp: passkey.signUserOp,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Preset swaps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {pipeline.presets.map((preset) => (
            <Button
              key={preset.id}
              size="sm"
              variant="outline"
              disabled={pipeline.busy || !passkey.address}
              onClick={() => void pipeline.runPreset(preset)}
            >
              {preset.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline — step: {pipeline.step}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pipeline.busy || !pipeline.op}
              onClick={() => void pipeline.runEstimate()}
            >
              2. Estimate
            </Button>
            <Button
              size="sm"
              disabled={pipeline.busy || !pipeline.op || !passkey.coords}
              onClick={() => void pipeline.runSign()}
            >
              3. Sign (WebAuthn)
            </Button>
            <Button
              size="sm"
              disabled={pipeline.busy || !pipeline.op}
              onClick={() => void pipeline.runSubmit()}
            >
              4. Submit
            </Button>
          </div>
          {pipeline.error && <p className="text-destructive text-sm">{pipeline.error}</p>}
        </CardContent>
      </Card>

      {pipeline.opJson && (
        <Card>
          <CardHeader>
            <CardTitle>UserOp JSON</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(pipeline.opJson, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {pipeline.estimate && (
        <Card>
          <CardHeader>
            <CardTitle>Gas estimate</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(pipeline.estimate, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {pipeline.userOpHash && (
        <Card>
          <CardHeader>
            <CardTitle>Submitted</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-mono text-xs break-all">userOpHash: {pipeline.userOpHash}</p>
            {pipeline.receipt && (
              <>
                <p>success: {String(pipeline.receipt.success)}</p>
                <p className="font-mono text-xs break-all">
                  tx: {pipeline.receipt.receipt?.transactionHash ?? '—'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
