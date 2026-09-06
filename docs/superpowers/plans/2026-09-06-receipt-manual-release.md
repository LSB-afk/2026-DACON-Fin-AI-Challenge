# 영수증/PDF/조직 UI 수동 릴리스 절차

새 push 또는 수동 배포 전에 Render Blueprint의 **Auto Sync**를 먼저 **No**로 둡니다. 이는 서비스의 `autoDeployTrigger`와 별도 기능이며, 켜져 있으면 Blueprint 동기화가 재배포를 유발할 수 있습니다. [Render Infrastructure as Code 문서](https://render.com/docs/infrastructure-as-code)

`render.yaml`의 `autoDeployTrigger: "off"`는 이 서비스의 Git 자동 배포를 끕니다. [Blueprint 사양](https://render.com/docs/blueprint-spec)의 `off` 설정을 사용하며, Render Dashboard에서 **Deploy a specific commit**을 선택해 영수증/PDF/조직 UI가 포함된 커밋의 전체 SHA를 지정하여 배포합니다. [Render 배포 문서](https://render.com/docs/deploys)

배포 완료 후 아래처럼 공개 서비스가 지정한 릴리스를 실행 중인지 확인합니다.

```sh
EXPECTED_DEPLOY_SHA='<배포한 전체 40자리 SHA>' npm --prefix service run smoke -- '<Render 서비스 URL>'
```

`/api/health`의 `revision`이 전체 SHA와 일치하고 smoke가 성공한 뒤에만 GitHub repository variables `RENDER_SERVICE_URL`과 `RENDER_EXPECTED_COMMIT`을 같은 URL/SHA로 갱신합니다. 그 다음에만 `RENDER_RELEASE_MODE=pinned`를 설정해 모니터링을 고정합니다. 마지막으로 Blueprint Auto Sync가 여전히 **No**인지 다시 확인합니다.
