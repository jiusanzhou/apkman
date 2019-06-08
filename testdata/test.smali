.class public final Lcom/tenpay/android/wechat/TenpaySecureEncrypt;
.super Ljava/lang/Object;
.source "SourceFile"

# interfaces
.implements Lcom/tenpay/android/wechat/ISecureEncrypt;


# direct methods
.method public constructor <init>()V
    .locals 0

    .prologue
    .line 10
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public final desedeEncode(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    .prologue
    .line 55
    new-instance v0, Lcom/tenpay/ndk/Encrypt;

    invoke-direct {v0}, Lcom/tenpay/ndk/Encrypt;-><init>()V

    .line 56
    invoke-virtual {v0, p1}, Lcom/tenpay/ndk/Encrypt;->desedeEncode(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 57
    return-object v0
.end method

.method public final desedeVerifyCode(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    .prologue
    .line 63
    new-instance v0, Lcom/tenpay/ndk/Encrypt;

    invoke-direct {v0}, Lcom/tenpay/ndk/Encrypt;-><init>()V

    .line 64
    invoke-virtual {v0, p1}, Lcom/tenpay/ndk/Encrypt;->desedeVerifyCode(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 66
    return-object v0
.end method

.method public final encryptPasswd(ZLjava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    .prologue
    .line 34
    if-eqz p1, :cond_0

    .line 37
    invoke-static {p2}, Lcom/tenpay/android/wechat/TenpayUtil;->md5HexDigest(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p2

    .line 43
    :cond_0
    new-instance v0, Lcom/tenpay/ndk/Encrypt;

    invoke-direct {v0}, Lcom/tenpay/ndk/Encrypt;-><init>()V

    .line 44
    if-eqz p3, :cond_1

    .line 45
    invoke-virtual {v0, p3}, Lcom/tenpay/ndk/Encrypt;->setTimeStamp(Ljava/lang/String;)V

    .line 47
    :cond_1
    invoke-virtual {v0, p2}, Lcom/tenpay/ndk/Encrypt;->encryptPasswd(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 49
    return-object v0
.end method

.method public final encryptPasswdWithRSA2048(ZLjava/lang/String;Ljava/lang/String;)Ljava/lang/String;
    .locals 1

    .prologue
    .line 14
    if-eqz p1, :cond_0

    .line 17
    invoke-static {p2}, Lcom/tenpay/android/wechat/TenpayUtil;->md5HexDigest(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p2

    .line 23
    :cond_0
    new-instance v0, Lcom/tenpay/ndk/Encrypt;

    invoke-direct {v0}, Lcom/tenpay/ndk/Encrypt;-><init>()V

    .line 24
    if-eqz p3, :cond_1

    .line 25
    invoke-virtual {v0, p3}, Lcom/tenpay/ndk/Encrypt;->setTimeStamp(Ljava/lang/String;)V

    .line 27
    :cond_1
    invoke-virtual {v0, p2}, Lcom/tenpay/ndk/Encrypt;->encryptPasswdWithRSA2048(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    .line 29
    return-object v0
.end method