package com.plaster.the.wall.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Edge-to-edge for @capacitor-community/safe-area: draws the WebView behind
    // the system bars and lets the plugin feed real safe-area insets to the web
    // layer (env(safe-area-inset-*)), which Android's WebView otherwise reports
    // as 0. The app's themed header/nav backgrounds then fill under the bars.
    EdgeToEdge.enable(this);
  }
}
