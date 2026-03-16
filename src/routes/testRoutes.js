import { sendPushNotification } from "../utils/sendPushNotification.js";

router.get("/test-push", async (req, res) => {

  const result = await sendPushNotification({
    token: "PASTE_YOUR_PUSH_TOKEN_HERE",
    title: "Helpio Test",
    body: "Push notifications are working 🚀",
    data: {
      type: "chat"
    }
  });

  res.json(result);

});