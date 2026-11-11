import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface InviteEmailTemplateProps {
  inviterName: string;
  householdName: string;
  inviteUrl: string;
}

export function InviteEmailTemplate({
  inviterName,
  householdName,
  inviteUrl,
}: InviteEmailTemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {inviterName} invited you to join {householdName} on Household List
      </Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif" }}>
        <Container
          style={{
            maxWidth: "480px",
            margin: "40px auto",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            padding: "32px",
          }}
        >
          <Heading style={{ fontSize: "20px", fontWeight: "600", color: "#111827" }}>
            You&apos;re invited to {householdName}
          </Heading>
          <Text style={{ color: "#374151", lineHeight: "1.6" }}>
            {inviterName} has invited you to join their household shopping list on{" "}
            <strong>Household List</strong>. Click below to accept the invitation and
            start collaborating.
          </Text>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button
              href={inviteUrl}
              style={{
                backgroundColor: "#111827",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: "500",
                textDecoration: "none",
              }}
            >
              Accept invitation
            </Button>
          </Section>
          <Text style={{ color: "#6b7280", fontSize: "12px" }}>
            This invitation expires in 7 days. If you didn&apos;t expect this email,
            you can ignore it safely.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
