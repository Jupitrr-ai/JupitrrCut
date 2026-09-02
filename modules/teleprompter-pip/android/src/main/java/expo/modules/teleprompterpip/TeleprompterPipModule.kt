package expo.modules.teleprompterpip

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TeleprompterPipModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TeleprompterPip")

    AsyncFunction("startTeleprompterPip") { config: Map<String, Any?> ->
      val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      val text = (config["text"] as? String).orEmpty()
      val fontSize = (config["fontSize"] as? Number)?.toFloat() ?: 24f
      val scrollSpeed = (config["scrollSpeed"] as? Number)?.toFloat() ?: 40f
      val prepDelay = (config["preparationDelaySeconds"] as? Number)?.toInt() ?: 3

      val intent = TeleprompterPipActivity.createIntent(
        context,
        text,
        fontSize,
        scrollSpeed,
        prepDelay
      )

      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("stopTeleprompterPip") {
      TeleprompterPipActivity.finishCurrent()
    }
  }
}
