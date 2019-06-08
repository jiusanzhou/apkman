# APKMan 开发过程

## 基本功能

- [ ] 设置
  - [ ] 依赖工具
    - [ ] 存放路径
    - [ ] 手动指定每一个工具路径
  - [ ] 设置工作区根路径 
- [ ] 文件加载
  - [ ] APK 文件
  - [ ] APK报名搜索
  - [ ] 打开apkman项目
- [ ] 左侧工具栏图标
- [ ] 左侧文件列表
	- [ ] 项目浏览
	- [ ] Smali 文件浏览
	- [ ] Java 文件浏览
	- [ ] 在线APK搜索
- [ ] editor core 功能
  - [ ] 代码搜索
  - [ ] 逻辑跳转
  - [ ] 界面文字/资源ID映射
  - [ ] 实时注入,界面跳转到代码
  - [ ] smali代码插入，逻辑修改，代码snippets
  - [ ] 重新打包，动态hook调试
- [ ] `smali` icon theme
- [ ] `smali` 语法

## 核心功能

一个典型的APK逆向分析过程分为静态分析和动态分析.

**静态分析**

|名称|描述|工具|备注|难度|完成度|
| :----- | :----- | :----- | :----- | :----- | :----- |
|APK decompiler|将APK解包成 smali 代码|[apktool](https://github.com/iBotPeaches/Apktool)|* Java依赖<br />|||


## 工具列表

|工具|版本|环境|
| :--- | :--- | :--- |
|apktool|[2.4.0](https://github.com/iBotPeaches/Apktool/releases/download/v2.4.0/apktool_2.4.0.jar)|Java|


## 参考链接

1. https://github.com/MobSF/Mobile-Security-Framework-MobSF
2. https://github.com/pjlantz/droidbox
3. https://github.com/alexMyG/AndroPyTool
4. https://github.com/androguard/androguard
5. https://github.com/vaibhavpandeyvpz/deapk
6. https://github.com/vaibhavpandeyvpz/apkstudio
7. https://github.com/patrickfav/uber-apk-signer
8. https://github.com/CrazyWolf2014/vscode-smali