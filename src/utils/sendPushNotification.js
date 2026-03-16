
export async function sendPushNotification({
  token,
  title,
  body,
  data = {},
}) {
  try {
    const message = {
      to: token,
      sound: "default",
      title,
      body,
      data,
    };

    const response = await fetch(
      "https://exp.host/--/api/v2/push/send",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      }
    );

    const result = await response.json();

    console.log("📨 Push notification sent:", result);

    return result;
  } catch (error) {
    console.error("❌ Push notification error:", error);
  }
}